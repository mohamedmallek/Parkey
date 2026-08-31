package com.onsr.pothole.service;

import com.onsr.pothole.dto.EventMapper;
import com.onsr.pothole.model.EventStatus;
import com.onsr.pothole.model.RoadEvent;
import com.onsr.pothole.model.StatusHistoryEntry;
import com.onsr.pothole.repository.RoadEventRepository;
import com.onsr.pothole.util.SeverityUtil;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class EventService {

    private final RoadEventRepository roadEventRepository;

    public EventService(RoadEventRepository roadEventRepository) {
        this.roadEventRepository = roadEventRepository;
    }

    public List<Map<String, Object>> list(int limit, String status, String city, String severity) {
        int safeLimit = Math.max(1, Math.min(limit, 2000));
        List<RoadEvent> raw = roadEventRepository.findAllByOrderByTsMsDesc(PageRequest.of(0, safeLimit));
        return raw.stream()
                .filter(e -> matchesStatus(e, status))
                .filter(e -> matchesCity(e, city))
                .filter(e -> matchesSeverity(e, severity))
                .map(EventMapper::toApiMap)
                .toList();
    }

    public Map<String, Object> getById(String id) {
        RoadEvent event = roadEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable"));
        return EventMapper.toApiMap(event);
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
        return EventMapper.toApiMap(roadEventRepository.save(event));
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
        return EventMapper.toApiMap(roadEventRepository.save(event));
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
            return EventMapper.toApiMap(event);
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
        return EventMapper.toApiMap(roadEventRepository.save(event));
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

    public void deleteById(String id) {
        if (!roadEventRepository.existsById(id)) {
            throw new IllegalArgumentException("Événement introuvable");
        }
        roadEventRepository.deleteById(id);
    }

    public int deleteByIds(List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        List<String> cleaned = ids.stream().filter(id -> id != null && !id.isBlank()).distinct().toList();
        List<RoadEvent> found = new ArrayList<>();
        roadEventRepository.findAllById(cleaned).forEach(found::add);
        roadEventRepository.deleteAll(found);
        return found.size();
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
