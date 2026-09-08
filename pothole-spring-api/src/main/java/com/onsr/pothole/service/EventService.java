package com.onsr.pothole.service;

import com.onsr.pothole.config.AppProperties;
import com.onsr.pothole.dto.EventMapper;
import com.onsr.pothole.model.EventStatus;
import com.onsr.pothole.model.RoadEvent;
import com.onsr.pothole.model.Role;
import com.onsr.pothole.model.StatusHistoryEntry;
import com.onsr.pothole.model.User;
import com.onsr.pothole.repository.RoadEventRepository;
import com.onsr.pothole.repository.UserRepository;
import com.onsr.pothole.util.SeverityUtil;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class EventService {

    private static final Path AFTER_FRAMES_DIR = Path.of("data", "after-frames");
    private static final Set<String> AFTER_TYPES = Set.of(
            MediaType.IMAGE_JPEG_VALUE,
            MediaType.IMAGE_PNG_VALUE,
            "image/webp",
            "image/jpg");

    private final RoadEventRepository roadEventRepository;
    private final UserRepository userRepository;
    private final AppProperties appProperties;

    public EventService(RoadEventRepository roadEventRepository, UserRepository userRepository, AppProperties appProperties) {
        this.roadEventRepository = roadEventRepository;
        this.userRepository = userRepository;
        this.appProperties = appProperties;
    }

    /** Enrichit la sérialisation d'un événement avec le suivi SLA (voir {@link #enrichWithSla}). */
    private Map<String, Object> toApiMap(RoadEvent e) {
        Map<String, Object> m = EventMapper.toApiMap(e);
        enrichWithSla(m, e);
        return m;
    }

    /**
     * Calcule le délai cible (SLA) de traitement à partir de la gravité et de la date de
     * confirmation du dossier (pas de la détection brute, pour ne pas pénaliser un dossier
     * qu'aucun humain n'a encore eu le temps de vérifier).
     */
    private void enrichWithSla(Map<String, Object> m, RoadEvent e) {
        EventStatus status = e.getStatus() != null ? e.getStatus() : EventStatus.NOUVEAU;
        boolean closed = status == EventStatus.RESOLU || status == EventStatus.FAUX_POSITIF;
        Long confirmedAtMs = e.getConfirmedAtMs();
        if (confirmedAtMs == null || closed) {
            m.put("sla_due_ms", null);
            m.put("sla_overdue", false);
            return;
        }
        String severity = String.valueOf(m.get("severity"));
        long dueMs = confirmedAtMs + slaHoursFor(severity) * 3_600_000L;
        m.put("sla_due_ms", dueMs);
        m.put("sla_overdue", System.currentTimeMillis() > dueMs);
    }

    private long slaHoursFor(String severity) {
        AppProperties.Sla sla = appProperties.getSla();
        return switch (severity == null ? "" : severity) {
            case "CRITIQUE" -> sla.getCriticalHours();
            case "ELEVEE" -> sla.getHighHours();
            case "MOYENNE" -> sla.getMediumHours();
            default -> sla.getLowHours();
        };
    }

    /**
     * Assigne (ou désassigne si userId est vide) un dossier à un opérateur terrain.
     * Un OPERATOR ne peut s'assigner qu'à lui-même ; ADMIN/SUPERADMIN peuvent assigner
     * n'importe quel opérateur.
     */
    public Map<String, Object> assignTo(String id, String userId, String actingUserId, Role actingRole) {
        RoadEvent event = roadEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable"));

        if (actingRole == Role.OPERATOR && userId != null && !userId.isBlank() && !userId.equals(actingUserId)) {
            throw new IllegalArgumentException("Un opérateur ne peut s'assigner qu'à lui-même");
        }

        if (userId == null || userId.isBlank()) {
            event.setAssignedUserId(null);
            event.setAssignedUserName(null);
            event.setAssignedAtMs(null);
        } else {
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new IllegalArgumentException("Utilisateur introuvable"));
            if (user.getRole() != Role.OPERATOR) {
                throw new IllegalArgumentException("Seul un opérateur peut être assigné à un dossier");
            }
            event.setAssignedUserId(user.getId());
            event.setAssignedUserName(user.getFullName());
            event.setAssignedAtMs(System.currentTimeMillis());
        }
        return toApiMap(roadEventRepository.save(event));
    }

    public Map<String, Long> stats() {
        return Map.of(
                "total", roadEventRepository.count(),
                "alerts", roadEventRepository.countByAlertTrue());
    }

    public List<Map<String, Object>> list(int limit, String status, String city, String severity) {
        int safeLimit = Math.max(1, Math.min(limit, 2000));
        List<RoadEvent> raw = roadEventRepository.findAllByOrderByTsMsDesc(PageRequest.of(0, safeLimit));
        return raw.stream()
                .filter(e -> matchesStatus(e, status))
                .filter(e -> matchesCity(e, city))
                .filter(e -> matchesSeverity(e, severity))
                .map(this::toApiMap)
                .toList();
    }

    public Map<String, Object> getById(String id) {
        RoadEvent event = roadEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable"));
        return toApiMap(event);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> applyRepairMaterials(String id, Map<String, Object> analysis) {
        RoadEvent event = roadEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable"));
        if (analysis.get("materials") instanceof List<?> list) {
            event.setRepairMaterials((List<Map<String, Object>>) list);
        }
        if (analysis.get("repair_steps") instanceof List<?> steps) {
            event.setRepairSteps(steps.stream().map(String::valueOf).toList());
        }
        event.setRepairNote(analysis.get("note") != null ? String.valueOf(analysis.get("note")) : null);
        event.setRepairConfidence(analysis.get("confidence") != null ? String.valueOf(analysis.get("confidence")) : null);
        event.setRepairMethod(analysis.get("method") != null ? String.valueOf(analysis.get("method")) : null);
        event.setRepairDisclaimer(analysis.get("disclaimer") != null ? String.valueOf(analysis.get("disclaimer")) : null);
        if (analysis.get("pothole_assessment") instanceof Map<?, ?> assess) {
            event.setRepairAssessment((Map<String, Object>) assess);
        }
        return toApiMap(roadEventRepository.save(event));
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> applyBudgetEstimate(String id, Map<String, Object> budget) {
        RoadEvent event = roadEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable"));
        event.setBudgetMinTnd(asDouble(budget.get("min_tnd")));
        event.setBudgetMaxTnd(asDouble(budget.get("max_tnd")));
        event.setBudgetMidTnd(asDouble(budget.get("mid_tnd")));
        event.setBudgetCurrency(budget.get("currency") != null ? String.valueOf(budget.get("currency")) : "TND");
        event.setBudgetMethod(budget.get("method") != null ? String.valueOf(budget.get("method")) : null);
        event.setBudgetNote(budget.get("note") != null ? String.valueOf(budget.get("note")) : null);
        event.setBudgetDisclaimer(budget.get("disclaimer") != null ? String.valueOf(budget.get("disclaimer")) : null);
        if (budget.get("breakdown") instanceof List<?> list) {
            event.setBudgetBreakdown((List<Map<String, Object>>) list);
        }
        return toApiMap(roadEventRepository.save(event));
    }

    private static Double asDouble(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.doubleValue();
        return Double.parseDouble(String.valueOf(v));
    }

    public Map<String, Object> updateStatus(
            String id,
            EventStatus newStatus,
            String userId,
            String userName,
            String userRole,
            String note) {
        RoadEvent event = roadEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable"));

        EventStatus current = event.getStatus() != null ? event.getStatus() : EventStatus.NOUVEAU;
        if (current == newStatus) {
            return toApiMap(event);
        }
        if (newStatus == EventStatus.RESOLU && (event.getAfterFramePath() == null || event.getAfterFramePath().isBlank())) {
            throw new IllegalArgumentException("Une photo après réparation est obligatoire avant de passer en résolu.");
        }

        if (newStatus == EventStatus.CONFIRME && event.getConfirmedAtMs() == null) {
            event.setConfirmedAtMs(System.currentTimeMillis());
        }

        StatusHistoryEntry entry = new StatusHistoryEntry();
        entry.setTsMs(System.currentTimeMillis());
        entry.setFromStatus(current);
        entry.setToStatus(newStatus);
        entry.setUserId(userId);
        entry.setUserName(userName);
        entry.setUserRole(userRole);
        entry.setNote(note);

        List<StatusHistoryEntry> history = event.getStatusHistory() != null
                ? new ArrayList<>(event.getStatusHistory())
                : new ArrayList<>();
        history.add(entry);

        event.setStatus(newStatus);
        event.setStatusHistory(history);
        return toApiMap(roadEventRepository.save(event));
    }

    public RoadEvent saveFromApiMap(Map<String, Object> raw, String userId) {
        if (raw.get("id") == null || String.valueOf(raw.get("id")).isBlank()) {
            raw.put("id", UUID.randomUUID().toString());
        }
        if (raw.get("ts_ms") == null) {
            raw.put("ts_ms", System.currentTimeMillis());
        }

        String id = String.valueOf(raw.get("id"));
        Optional<RoadEvent> existing = roadEventRepository.findById(id);

        RoadEvent event = EventMapper.fromApiMap(raw, userId);
        if (existing.isPresent()) {
            RoadEvent prev = existing.get();
            event.setStatus(prev.getStatus() != null ? prev.getStatus() : EventStatus.NOUVEAU);
            event.setStatusHistory(prev.getStatusHistory());
            event.setAfterFramePath(prev.getAfterFramePath());
            event.setAfterTsMs(prev.getAfterTsMs());
            event.setAssignedUserId(prev.getAssignedUserId());
            event.setAssignedUserName(prev.getAssignedUserName());
            event.setAssignedAtMs(prev.getAssignedAtMs());
            event.setConfirmedAtMs(prev.getConfirmedAtMs());
        } else {
            event.setStatus(EventStatus.NOUVEAU);
            StatusHistoryEntry created = new StatusHistoryEntry();
            created.setTsMs(System.currentTimeMillis());
            created.setFromStatus(null);
            created.setToStatus(EventStatus.NOUVEAU);
            created.setUserId(userId);
            created.setUserName("Système IA");
            created.setUserRole("SYSTEM");
            created.setNote("Détecté automatiquement par le modèle IA");
            event.setStatusHistory(new ArrayList<>(List.of(created)));
        }
        return roadEventRepository.save(event);
    }

    public Map<String, Object> saveAfterPhoto(String id, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Choisissez une photo après réparation.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!AFTER_TYPES.contains(contentType) && !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("La photo après doit être une image (JPG, PNG ou WebP).");
        }
        RoadEvent event = roadEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable"));
        try {
            Files.createDirectories(AFTER_FRAMES_DIR);
            Path dest = AFTER_FRAMES_DIR.resolve(id + ".jpg").normalize();
            Files.write(dest, file.getBytes());
            event.setAfterFramePath(dest.toString().replace('\\', '/'));
            event.setAfterTsMs(System.currentTimeMillis());
            return toApiMap(roadEventRepository.save(event));
        } catch (IOException e) {
            throw new IllegalStateException("Impossible d’enregistrer la photo après", e);
        }
    }

    public byte[] afterPhotoBytes(String id) {
        RoadEvent event = roadEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable"));
        if (event.getAfterFramePath() == null || event.getAfterFramePath().isBlank()) {
            throw new IllegalArgumentException("Aucune photo après pour ce dossier");
        }
        Path path = Path.of(event.getAfterFramePath());
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("Photo après introuvable");
        }
        try {
            return Files.readAllBytes(path);
        } catch (IOException e) {
            throw new IllegalStateException("Lecture de la photo après impossible", e);
        }
    }

    public void deleteById(String id) {
        if (!roadEventRepository.existsById(id)) {
            throw new IllegalArgumentException("Événement introuvable");
        }
        deleteAfterPhotoFile(id);
        roadEventRepository.deleteById(id);
    }

    public int deleteByIds(List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        List<String> cleaned = ids.stream().filter(id -> id != null && !id.isBlank()).distinct().toList();
        List<RoadEvent> found = new ArrayList<>();
        roadEventRepository.findAllById(cleaned).forEach(found::add);
        found.forEach(e -> deleteAfterPhotoFile(e.getId()));
        roadEventRepository.deleteAll(found);
        return found.size();
    }

    private void deleteAfterPhotoFile(String id) {
        try {
            Files.deleteIfExists(AFTER_FRAMES_DIR.resolve(id + ".jpg"));
        } catch (IOException ignored) {
            // best effort
        }
    }

    public void saveAllFromApiMaps(List<Map<String, Object>> items, String userId) {
        for (Map<String, Object> item : items) {
            saveFromApiMap(item, userId);
        }
    }

    public byte[] exportJson(int limit) {
        try {
            String json = new com.fasterxml.jackson.databind.ObjectMapper()
                    .writerWithDefaultPrettyPrinter()
                    .writeValueAsString(Map.of("events", list(limit, null, null, null)));
            return json.getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Export JSON échoué", e);
        }
    }

    public byte[] exportCsv(int limit) {
        List<Map<String, Object>> events = list(limit, null, null, null);
        StringBuilder sb = new StringBuilder();
        sb.append("id,ts_ms,model,label,prob,lat,lon,city,zone,source,alert,status,severity\n");
        for (Map<String, Object> e : events) {
            sb.append(csv(e.get("id"))).append(',')
                    .append(csv(e.get("ts_ms"))).append(',')
                    .append(csv(e.get("model"))).append(',')
                    .append(csv(e.get("label"))).append(',')
                    .append(csv(e.get("prob"))).append(',')
                    .append(csv(e.get("lat"))).append(',')
                    .append(csv(e.get("lon"))).append(',')
                    .append(csv(e.get("city"))).append(',')
                    .append(csv(e.get("zone"))).append(',')
                    .append(csv(e.get("source"))).append(',')
                    .append(csv(e.get("alert"))).append(',')
                    .append(csv(e.get("status"))).append(',')
                    .append(csv(e.get("severity")))
                    .append('\n');
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static boolean matchesStatus(RoadEvent e, String status) {
        if (status == null || status.isBlank()) {
            return true;
        }
        EventStatus current = e.getStatus() != null ? e.getStatus() : EventStatus.NOUVEAU;
        return current.name().equalsIgnoreCase(status.trim());
    }

    private static boolean matchesCity(RoadEvent e, String city) {
        if (city == null || city.isBlank()) {
            return true;
        }
        if (e.getCity() == null) {
            return false;
        }
        return e.getCity().trim().equalsIgnoreCase(city.trim());
    }

    private static boolean matchesSeverity(RoadEvent e, String severity) {
        if (severity == null || severity.isBlank()) {
            return true;
        }
        String computed = SeverityUtil.compute(e.getAlert(), e.getProb());
        return computed.equalsIgnoreCase(severity.trim());
    }

    private static String csv(Object v) {
        if (v == null) return "";
        String s = String.valueOf(v);
        if (s.contains(",") || s.contains("\"")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }
}
