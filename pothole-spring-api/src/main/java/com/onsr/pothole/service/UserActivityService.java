package com.onsr.pothole.service;

import com.onsr.pothole.dto.UserActivityResponse;
import com.onsr.pothole.dto.UserSessionResponse;
import com.onsr.pothole.model.Role;
import com.onsr.pothole.model.User;
import com.onsr.pothole.model.UserSession;
import com.onsr.pothole.repository.UserRepository;
import com.onsr.pothole.repository.UserSessionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Suivi d'activité des comptes pour les Superadmin/Admin : qui est en ligne
 * ou non, depuis quand, combien de temps utilisé aujourd'hui, et historique
 * complet des connexions (de quelle heure à quelle heure) par utilisateur.
 *
 * Visibilité : un Superadmin voit tout le monde (sauf lui-même) ; un Admin ne
 * voit que les Opérateurs et Lecteurs (pas les autres Admins, ni le
 * Superadmin) — hiérarchie stricte demandée par le projet.
 */
@Service
public class UserActivityService {

    private static final ZoneId ZONE = ZoneId.of("Africa/Tunis");
    /** Un utilisateur est considéré « en ligne » si son dernier signal (heartbeat, ~toutes les 45 s) date de moins de 90 s. */
    private static final Duration ONLINE_WINDOW = Duration.ofSeconds(90);

    private final UserRepository userRepository;
    private final UserSessionRepository sessionRepository;

    public UserActivityService(UserRepository userRepository, UserSessionRepository sessionRepository) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
    }

    public List<UserActivityResponse> listActivity(Role callerRole, String callerId) {
        List<Role> visibleRoles = visibleRolesFor(callerRole);
        List<User> users = userRepository.findAll().stream()
                .filter(u -> visibleRoles.contains(u.getRole()))
                .filter(u -> !u.getId().equals(callerId))
                .collect(Collectors.toList());

        List<UserActivityResponse> out = new ArrayList<>();
        for (User u : users) {
            out.add(buildActivity(u));
        }
        out.sort(
                Comparator.comparing(UserActivityResponse::isOnline).reversed()
                        .thenComparing(
                                (UserActivityResponse a) -> a.getLastSeenAtMs() == null ? 0L : a.getLastSeenAtMs(),
                                Comparator.reverseOrder()));
        return out;
    }

    public Map<String, Object> listSessions(String userId, Role callerRole, String callerId, int page, int size) {
        User target = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Utilisateur introuvable"));
        assertCanView(callerRole, callerId, target);

        int safeSize = Math.max(1, Math.min(size, 100));
        Pageable pageable = PageRequest.of(Math.max(page, 0), safeSize, Sort.by(Sort.Direction.DESC, "loginAt"));
        Page<UserSession> sessions = sessionRepository.findByUserIdOrderByLoginAtDesc(userId, pageable);

        return Map.of(
                "user", buildActivity(target),
                "sessions", sessions.getContent().stream().map(this::toSessionResponse).toList(),
                "page", page,
                "totalPages", sessions.getTotalPages(),
                "totalElements", sessions.getTotalElements());
    }

    private void assertCanView(Role callerRole, String callerId, User target) {
        if (target.getId().equals(callerId)) {
            throw new IllegalArgumentException("Vous ne pouvez pas consulter votre propre activité ici.");
        }
        if (!visibleRolesFor(callerRole).contains(target.getRole())) {
            throw new IllegalArgumentException("Vous n’êtes pas autorisé à consulter l’activité de cet utilisateur.");
        }
    }

    private List<Role> visibleRolesFor(Role callerRole) {
        if (callerRole == Role.SUPERADMIN) {
            return List.of(Role.SUPERADMIN, Role.ADMIN, Role.OPERATOR, Role.VIEWER);
        }
        if (callerRole == Role.ADMIN) {
            return List.of(Role.OPERATOR, Role.VIEWER);
        }
        return List.of();
    }

    private UserActivityResponse buildActivity(User u) {
        List<UserSession> sessions = sessionRepository.findByUserIdOrderByLoginAtDesc(u.getId());

        UserActivityResponse r = new UserActivityResponse();
        r.setId(u.getId());
        r.setFullName(u.getFullName());
        r.setEmail(u.getEmail());
        r.setRole(u.getRole());
        r.setEnabled(u.isEnabled());
        r.setSessionsCount(sessions.size());

        if (sessions.isEmpty()) {
            r.setOnline(false);
            r.setLastLoginAtMs(null);
            r.setLastSeenAtMs(null);
            r.setTodayActiveMs(0L);
            return r;
        }

        UserSession latest = sessions.get(0);
        boolean online = latest.getLogoutAt() == null
                && latest.getLastHeartbeatAt() != null
                && latest.getLastHeartbeatAt().isAfter(Instant.now().minus(ONLINE_WINDOW));
        r.setOnline(online);
        r.setLastLoginAtMs(latest.getLoginAt() == null ? null : latest.getLoginAt().toEpochMilli());

        Instant lastSeen = latest.getLogoutAt() != null
                ? latest.getLogoutAt()
                : (latest.getLastHeartbeatAt() != null ? latest.getLastHeartbeatAt() : latest.getLoginAt());
        r.setLastSeenAtMs(lastSeen == null ? null : lastSeen.toEpochMilli());

        long todayMs = 0;
        Instant todayStart = LocalDate.now(ZONE).atStartOfDay(ZONE).toInstant();
        for (UserSession s : sessions) {
            if (s.getLoginAt() == null) continue;
            Instant end = s.getLogoutAt() != null ? s.getLogoutAt() : Instant.now();
            if (end.isBefore(todayStart)) {
                // Les sessions sont triées de la plus récente à la plus ancienne : dès qu'une session
                // entière se termine avant le début de la journée, toutes les suivantes aussi.
                break;
            }
            todayMs += overlapMs(s.getLoginAt(), end, todayStart, Instant.now());
        }
        r.setTodayActiveMs(todayMs);
        return r;
    }

    private long overlapMs(Instant start, Instant end, Instant windowStart, Instant windowEnd) {
        Instant a = start.isAfter(windowStart) ? start : windowStart;
        Instant b = end.isBefore(windowEnd) ? end : windowEnd;
        if (b.isBefore(a)) return 0;
        return Duration.between(a, b).toMillis();
    }

    private UserSessionResponse toSessionResponse(UserSession s) {
        UserSessionResponse r = new UserSessionResponse();
        r.setId(s.getId());
        r.setLoginAtMs(s.getLoginAt() == null ? 0 : s.getLoginAt().toEpochMilli());
        boolean ongoing = s.getLogoutAt() == null;
        r.setOngoing(ongoing);
        r.setLogoutAtMs(ongoing ? null : s.getLogoutAt().toEpochMilli());
        Instant end = ongoing ? Instant.now() : s.getLogoutAt();
        r.setDurationMs(s.getLoginAt() == null ? 0 : Duration.between(s.getLoginAt(), end).toMillis());
        r.setEndReason(s.getEndReason());
        return r;
    }
}
