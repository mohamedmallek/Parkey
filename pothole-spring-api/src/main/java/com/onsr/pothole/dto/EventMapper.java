package com.onsr.pothole.dto;

import com.onsr.pothole.model.EventStatus;
import com.onsr.pothole.model.RoadEvent;
import com.onsr.pothole.model.StatusHistoryEntry;
import com.onsr.pothole.util.SeverityUtil;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public final class EventMapper {

    private EventMapper() {}

    @SuppressWarnings("unchecked")
    public static Map<String, Object> toApiMap(RoadEvent e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("ts_ms", e.getTsMs());
        m.put("model", e.getModel());
        m.put("task", e.getTask());
        m.put("filename", e.getFilename());
        m.put("label", e.getLabel());
        m.put("prob", e.getProb());
        m.put("topk", e.getTopk());
        m.put("bbox_norm", e.getBboxNorm());
        m.put("bbox_px", e.getBboxPx());
        m.put("center_norm", e.getCenterNorm());
        m.put("alert", e.getAlert());
        m.put("threshold", e.getThreshold());
        m.put("lat", e.getLat());
        m.put("lon", e.getLon());
        m.put("speed_kmh", e.getSpeedKmh());
        m.put("city", e.getCity());
        m.put("zone", e.getZone());
        m.put("source", e.getSource());
        m.put("video_ts_ms", e.getVideoTsMs());
        m.put("frame_idx", e.getFrameIdx());
        m.put("detection_count", e.getDetectionCount());
        m.put("ocr_text", e.getOcrText());
        m.put("frame_path", e.getFramePath());
        EventStatus status = e.getStatus() != null ? e.getStatus() : EventStatus.NOUVEAU;
        m.put("status", status.name());
        m.put("severity", SeverityUtil.compute(e.getAlert(), e.getProb(), e.getSizeClass()));
        m.put("status_history", toHistoryApiList(e.getStatusHistory()));
        m.put("size_class", e.getSizeClass());
        m.put("width_cm_est", e.getWidthCmEst());
        m.put("length_cm_est", e.getLengthCmEst());
        m.put("max_dim_cm_est", e.getMaxDimCmEst());
        m.put("depth_proxy", e.getDepthProxy());
        m.put("depth_score", e.getDepthScore());
        m.put("size_calibration", e.getSizeCalibration());
        m.put("budget_min_tnd", e.getBudgetMinTnd());
        m.put("budget_max_tnd", e.getBudgetMaxTnd());
        m.put("budget_mid_tnd", e.getBudgetMidTnd());
        m.put("budget_currency", e.getBudgetCurrency());
        m.put("budget_method", e.getBudgetMethod());
        m.put("budget_note", e.getBudgetNote());
        m.put("budget_disclaimer", e.getBudgetDisclaimer());
        m.put("budget_breakdown", e.getBudgetBreakdown());
        m.put("repair_materials", e.getRepairMaterials());
        m.put("repair_steps", e.getRepairSteps());
        m.put("repair_note", e.getRepairNote());
        m.put("repair_confidence", e.getRepairConfidence());
        m.put("repair_method", e.getRepairMethod());
        m.put("repair_disclaimer", e.getRepairDisclaimer());
        m.put("repair_assessment", e.getRepairAssessment());
        return m;
    }

    private static List<Map<String, Object>> toHistoryApiList(List<StatusHistoryEntry> history) {
        if (history == null || history.isEmpty()) {
            return List.of();
        }
        return history.stream().map(EventMapper::historyToApiMap).collect(Collectors.toList());
    }

    private static Map<String, Object> historyToApiMap(StatusHistoryEntry h) {
        Map<String, Object> m = new HashMap<>();
        m.put("ts_ms", h.getTsMs());
        m.put("from_status", h.getFromStatus() != null ? h.getFromStatus().name() : null);
        m.put("to_status", h.getToStatus() != null ? h.getToStatus().name() : null);
        m.put("user_id", h.getUserId());
        m.put("user_name", h.getUserName());
        m.put("user_role", h.getUserRole());
        m.put("note", h.getNote());
        return m;
    }

    @SuppressWarnings("unchecked")
    public static RoadEvent fromApiMap(Map<String, Object> m, String userId) {
        RoadEvent e = new RoadEvent();
        if (m.get("id") != null) {
            e.setId(String.valueOf(m.get("id")));
        }
        e.setTsMs(asLong(m.get("ts_ms")));
        e.setModel(asString(m.get("model")));
        e.setTask(asString(m.get("task")));
        e.setFilename(asString(m.get("filename")));
        e.setLabel(asString(m.get("label")));
        e.setProb(asDouble(m.get("prob")));
        if (m.get("topk") instanceof List<?> list) {
            e.setTopk((List<Map<String, Object>>) list);
        }
        if (m.get("bbox_norm") instanceof Map<?, ?> map) {
            e.setBboxNorm((Map<String, Object>) map);
        }
        if (m.get("bbox_px") instanceof Map<?, ?> map) {
            e.setBboxPx((Map<String, Object>) map);
        }
        if (m.get("center_norm") instanceof Map<?, ?> map) {
            e.setCenterNorm((Map<String, Object>) map);
        }
        e.setAlert(asBoolean(m.get("alert")));
        e.setThreshold(asDouble(m.get("threshold")));
        e.setLat(asDouble(m.get("lat")));
        e.setLon(asDouble(m.get("lon")));
        e.setSpeedKmh(asDouble(m.get("speed_kmh")));
        e.setCity(asString(m.get("city")));
        e.setZone(asString(m.get("zone")));
        e.setSource(asString(m.get("source")));
        e.setVideoTsMs(asLong(m.get("video_ts_ms")));
        e.setFrameIdx(asInteger(m.get("frame_idx")));
        e.setDetectionCount(asInteger(m.get("detection_count")));
        e.setOcrText(asString(m.get("ocr_text")));
        e.setFramePath(asString(m.get("frame_path")));
        e.setCreatedByUserId(userId);
        e.setSizeClass(asString(m.get("size_class")));
        e.setWidthCmEst(asDouble(m.get("width_cm_est")));
        e.setLengthCmEst(asDouble(m.get("length_cm_est")));
        e.setMaxDimCmEst(asDouble(m.get("max_dim_cm_est")));
        e.setDepthProxy(asString(m.get("depth_proxy")));
        e.setDepthScore(asDouble(m.get("depth_score")));
        if (m.get("size_calibration") instanceof Map<?, ?> cal) {
            e.setSizeCalibration((Map<String, Object>) cal);
        }
        e.setBudgetMinTnd(asDouble(m.get("budget_min_tnd")));
        e.setBudgetMaxTnd(asDouble(m.get("budget_max_tnd")));
        e.setBudgetMidTnd(asDouble(m.get("budget_mid_tnd")));
        e.setBudgetCurrency(asString(m.get("budget_currency")));
        e.setBudgetMethod(asString(m.get("budget_method")));
        e.setBudgetNote(asString(m.get("budget_note")));
        e.setBudgetDisclaimer(asString(m.get("budget_disclaimer")));
        if (m.get("budget_breakdown") instanceof List<?> bl) {
            e.setBudgetBreakdown((List<Map<String, Object>>) bl);
        } else if (m.get("budget_estimate") instanceof Map<?, ?> be) {
            applyBudgetFromEstimate(e, (Map<String, Object>) be);
        }
        if (m.get("repair_materials") instanceof List<?> rm) {
            e.setRepairMaterials((List<Map<String, Object>>) rm);
        } else if (m.get("repair_analysis") instanceof Map<?, ?> ra) {
            applyRepairFromAnalysis(e, (Map<String, Object>) ra);
        }
        if (m.get("repair_steps") instanceof List<?> rs) {
            e.setRepairSteps(rs.stream().map(String::valueOf).collect(Collectors.toList()));
        }
        e.setRepairNote(asString(m.get("repair_note")));
        e.setRepairConfidence(asString(m.get("repair_confidence")));
        e.setRepairMethod(asString(m.get("repair_method")));
        e.setRepairDisclaimer(asString(m.get("repair_disclaimer")));
        if (m.get("repair_assessment") instanceof Map<?, ?> ra2) {
            e.setRepairAssessment((Map<String, Object>) ra2);
        }
        return e;
    }

    @SuppressWarnings("unchecked")
    private static void applyRepairFromAnalysis(RoadEvent e, Map<String, Object> a) {
        if (a.get("materials") instanceof List<?> list) {
            e.setRepairMaterials((List<Map<String, Object>>) list);
        }
        if (a.get("repair_steps") instanceof List<?> steps) {
            e.setRepairSteps(steps.stream().map(String::valueOf).collect(Collectors.toList()));
        }
        e.setRepairNote(asString(a.get("note")));
        e.setRepairConfidence(asString(a.get("confidence")));
        e.setRepairMethod(asString(a.get("method")));
        e.setRepairDisclaimer(asString(a.get("disclaimer")));
        if (a.get("pothole_assessment") instanceof Map<?, ?> assess) {
            e.setRepairAssessment((Map<String, Object>) assess);
        }
    }

    @SuppressWarnings("unchecked")
    private static void applyBudgetFromEstimate(RoadEvent e, Map<String, Object> b) {
        e.setBudgetMinTnd(asDouble(b.get("min_tnd")));
        e.setBudgetMaxTnd(asDouble(b.get("max_tnd")));
        e.setBudgetMidTnd(asDouble(b.get("mid_tnd")));
        e.setBudgetCurrency(asString(b.get("currency")));
        e.setBudgetMethod(asString(b.get("method")));
        e.setBudgetNote(asString(b.get("note")));
        e.setBudgetDisclaimer(asString(b.get("disclaimer")));
        if (b.get("breakdown") instanceof List<?> list) {
            e.setBudgetBreakdown((List<Map<String, Object>>) list);
        }
    }

    public static List<Map<String, Object>> toApiList(List<RoadEvent> events) {
        return events.stream().map(EventMapper::toApiMap).collect(Collectors.toList());
    }

    private static String asString(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Long asLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        return Long.parseLong(String.valueOf(v));
    }

    private static Integer asInteger(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        return Integer.parseInt(String.valueOf(v));
    }

    private static Double asDouble(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.doubleValue();
        return Double.parseDouble(String.valueOf(v));
    }

    private static Boolean asBoolean(Object v) {
        if (v == null) return null;
        if (v instanceof Boolean b) return b;
        return Boolean.parseBoolean(String.valueOf(v));
    }
}
