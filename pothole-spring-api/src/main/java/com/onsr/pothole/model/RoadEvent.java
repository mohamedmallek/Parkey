package com.onsr.pothole.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.List;
import java.util.Map;

@Document(collection = "road_events")
public class RoadEvent {

    @Id
    private String id;

    @Indexed
    private Long tsMs;

    private String model;
    private String task;
    private String filename;
    private String label;
    private Double prob;
    private List<Map<String, Object>> topk;
    private Map<String, Object> bboxNorm;
    private Map<String, Object> bboxPx;
    private Map<String, Object> centerNorm;
    private Boolean alert;
    private Double threshold;
    private Double lat;
    private Double lon;
    private Double speedKmh;
    private String city;
    private String zone;
    private String source;
    private Long videoTsMs;
    private Integer frameIdx;
    private Integer detectionCount;
    private String ocrText;
    private String framePath;
    private String createdByUserId;
    private EventStatus status;
    private List<StatusHistoryEntry> statusHistory;
    private String sizeClass;
    private Double widthCmEst;
    private Double lengthCmEst;
    private Double maxDimCmEst;
    private String depthProxy;
    private Double depthScore;
    private java.util.Map<String, Object> sizeCalibration;
    private Double budgetMinTnd;
    private Double budgetMaxTnd;
    private Double budgetMidTnd;
    private String budgetCurrency;
    private String budgetMethod;
    private String budgetNote;
    private String budgetDisclaimer;
    private java.util.List<java.util.Map<String, Object>> budgetBreakdown;
    private java.util.List<java.util.Map<String, Object>> repairMaterials;
    private java.util.List<String> repairSteps;
    private String repairNote;
    private String repairConfidence;
    private String repairMethod;
    private String repairDisclaimer;
    private java.util.Map<String, Object> repairAssessment;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Long getTsMs() {
        return tsMs;
    }

    public void setTsMs(Long tsMs) {
        this.tsMs = tsMs;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getTask() {
        return task;
    }

    public void setTask(String task) {
        this.task = task;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public Double getProb() {
        return prob;
    }

    public void setProb(Double prob) {
        this.prob = prob;
    }

    public List<Map<String, Object>> getTopk() {
        return topk;
    }

    public void setTopk(List<Map<String, Object>> topk) {
        this.topk = topk;
    }

    public Map<String, Object> getBboxNorm() {
        return bboxNorm;
    }

    public void setBboxNorm(Map<String, Object> bboxNorm) {
        this.bboxNorm = bboxNorm;
    }

    public Map<String, Object> getBboxPx() {
        return bboxPx;
    }

    public void setBboxPx(Map<String, Object> bboxPx) {
        this.bboxPx = bboxPx;
    }

    public Map<String, Object> getCenterNorm() {
        return centerNorm;
    }

    public void setCenterNorm(Map<String, Object> centerNorm) {
        this.centerNorm = centerNorm;
    }

    public Boolean getAlert() {
        return alert;
    }

    public void setAlert(Boolean alert) {
        this.alert = alert;
    }

    public Double getThreshold() {
        return threshold;
    }

    public void setThreshold(Double threshold) {
        this.threshold = threshold;
    }

    public Double getLat() {
        return lat;
    }

    public void setLat(Double lat) {
        this.lat = lat;
    }

    public Double getLon() {
        return lon;
    }

    public void setLon(Double lon) {
        this.lon = lon;
    }

    public Double getSpeedKmh() {
        return speedKmh;
    }

    public void setSpeedKmh(Double speedKmh) {
        this.speedKmh = speedKmh;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getZone() {
        return zone;
    }

    public void setZone(String zone) {
        this.zone = zone;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Long getVideoTsMs() {
        return videoTsMs;
    }

    public void setVideoTsMs(Long videoTsMs) {
        this.videoTsMs = videoTsMs;
    }

    public Integer getFrameIdx() {
        return frameIdx;
    }

    public void setFrameIdx(Integer frameIdx) {
        this.frameIdx = frameIdx;
    }

    public Integer getDetectionCount() {
        return detectionCount;
    }

    public void setDetectionCount(Integer detectionCount) {
        this.detectionCount = detectionCount;
    }

    public String getOcrText() {
        return ocrText;
    }

    public void setOcrText(String ocrText) {
        this.ocrText = ocrText;
    }

    public String getFramePath() {
        return framePath;
    }

    public void setFramePath(String framePath) {
        this.framePath = framePath;
    }

    public String getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(String createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public EventStatus getStatus() {
        return status;
    }

    public void setStatus(EventStatus status) {
        this.status = status;
    }

    public List<StatusHistoryEntry> getStatusHistory() {
        return statusHistory;
    }

    public void setStatusHistory(List<StatusHistoryEntry> statusHistory) {
        this.statusHistory = statusHistory;
    }

    public String getSizeClass() {
        return sizeClass;
    }

    public void setSizeClass(String sizeClass) {
        this.sizeClass = sizeClass;
    }

    public Double getWidthCmEst() {
        return widthCmEst;
    }

    public void setWidthCmEst(Double widthCmEst) {
        this.widthCmEst = widthCmEst;
    }

    public Double getLengthCmEst() {
        return lengthCmEst;
    }

    public void setLengthCmEst(Double lengthCmEst) {
        this.lengthCmEst = lengthCmEst;
    }

    public Double getMaxDimCmEst() {
        return maxDimCmEst;
    }

    public void setMaxDimCmEst(Double maxDimCmEst) {
        this.maxDimCmEst = maxDimCmEst;
    }

    public String getDepthProxy() {
        return depthProxy;
    }

    public void setDepthProxy(String depthProxy) {
        this.depthProxy = depthProxy;
    }

    public Double getDepthScore() {
        return depthScore;
    }

    public void setDepthScore(Double depthScore) {
        this.depthScore = depthScore;
    }

    public java.util.Map<String, Object> getSizeCalibration() {
        return sizeCalibration;
    }

    public void setSizeCalibration(java.util.Map<String, Object> sizeCalibration) {
        this.sizeCalibration = sizeCalibration;
    }

    public Double getBudgetMinTnd() {
        return budgetMinTnd;
    }

    public void setBudgetMinTnd(Double budgetMinTnd) {
        this.budgetMinTnd = budgetMinTnd;
    }

    public Double getBudgetMaxTnd() {
        return budgetMaxTnd;
    }

    public void setBudgetMaxTnd(Double budgetMaxTnd) {
        this.budgetMaxTnd = budgetMaxTnd;
    }

    public Double getBudgetMidTnd() {
        return budgetMidTnd;
    }

    public void setBudgetMidTnd(Double budgetMidTnd) {
        this.budgetMidTnd = budgetMidTnd;
    }

    public String getBudgetCurrency() {
        return budgetCurrency;
    }

    public void setBudgetCurrency(String budgetCurrency) {
        this.budgetCurrency = budgetCurrency;
    }

    public String getBudgetMethod() {
        return budgetMethod;
    }

    public void setBudgetMethod(String budgetMethod) {
        this.budgetMethod = budgetMethod;
    }

    public String getBudgetNote() {
        return budgetNote;
    }

    public void setBudgetNote(String budgetNote) {
        this.budgetNote = budgetNote;
    }

    public String getBudgetDisclaimer() {
        return budgetDisclaimer;
    }

    public void setBudgetDisclaimer(String budgetDisclaimer) {
        this.budgetDisclaimer = budgetDisclaimer;
    }

    public java.util.List<java.util.Map<String, Object>> getBudgetBreakdown() {
        return budgetBreakdown;
    }

    public void setBudgetBreakdown(java.util.List<java.util.Map<String, Object>> budgetBreakdown) {
        this.budgetBreakdown = budgetBreakdown;
    }

    public java.util.List<java.util.Map<String, Object>> getRepairMaterials() {
        return repairMaterials;
    }

    public void setRepairMaterials(java.util.List<java.util.Map<String, Object>> repairMaterials) {
        this.repairMaterials = repairMaterials;
    }

    public java.util.List<String> getRepairSteps() {
        return repairSteps;
    }

    public void setRepairSteps(java.util.List<String> repairSteps) {
        this.repairSteps = repairSteps;
    }

    public String getRepairNote() {
        return repairNote;
    }

    public void setRepairNote(String repairNote) {
        this.repairNote = repairNote;
    }

    public String getRepairConfidence() {
        return repairConfidence;
    }

    public void setRepairConfidence(String repairConfidence) {
        this.repairConfidence = repairConfidence;
    }

    public String getRepairMethod() {
        return repairMethod;
    }

    public void setRepairMethod(String repairMethod) {
        this.repairMethod = repairMethod;
    }

    public String getRepairDisclaimer() {
        return repairDisclaimer;
    }

    public void setRepairDisclaimer(String repairDisclaimer) {
        this.repairDisclaimer = repairDisclaimer;
    }

    public java.util.Map<String, Object> getRepairAssessment() {
        return repairAssessment;
    }

    public void setRepairAssessment(java.util.Map<String, Object> repairAssessment) {
        this.repairAssessment = repairAssessment;
    }
}
