package com.onsr.pothole.service;

import com.onsr.pothole.model.UserSession;
import com.onsr.pothole.repository.UserSessionRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Ferme automatiquement les sessions abandonnées : si un utilisateur ferme
 * l'onglet ou son navigateur plante sans déconnexion explicite, plus aucun
 * heartbeat n'arrive. Sans ce nettoyage, la session resterait « ouverte »
 * indéfiniment dans l'historique. On la clôture avec l'heure du dernier
 * signal reçu, qui est la meilleure estimation de l'heure réelle de fin.
 */
@Component
public class SessionCleanupScheduler {

    private static final Duration STALE_TIMEOUT = Duration.ofMinutes(3);

    private final UserSessionRepository sessionRepository;

    public SessionCleanupScheduler(UserSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    @Scheduled(fixedRate = 60_000)
    public void closeStaleSessions() {
        Instant threshold = Instant.now().minus(STALE_TIMEOUT);
        List<UserSession> stale = sessionRepository.findByLogoutAtIsNullAndLastHeartbeatAtBefore(threshold);
        if (stale.isEmpty()) return;
        for (UserSession s : stale) {
            Instant end = s.getLastHeartbeatAt() != null ? s.getLastHeartbeatAt() : s.getLoginAt();
            s.setLogoutAt(end != null ? end : Instant.now());
            s.setEndReason("timeout");
        }
        sessionRepository.saveAll(stale);
    }
}
