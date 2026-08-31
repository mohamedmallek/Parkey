package com.onsr.pothole.model;

public class StatusHistoryEntry {

    private Long tsMs;
    private EventStatus fromStatus;
    private EventStatus toStatus;
    private String userId;
    private String userName;
    private String userRole;
    private String note;

    public Long getTsMs() {
        return tsMs;
    }

    public void setTsMs(Long tsMs) {
        this.tsMs = tsMs;
    }

    public EventStatus getFromStatus() {
        return fromStatus;
    }

    public void setFromStatus(EventStatus fromStatus) {
        this.fromStatus = fromStatus;
    }

    public EventStatus getToStatus() {
        return toStatus;
    }

    public void setToStatus(EventStatus toStatus) {
        this.toStatus = toStatus;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public String getUserRole() {
        return userRole;
    }

    public void setUserRole(String userRole) {
        this.userRole = userRole;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
