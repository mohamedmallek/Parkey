package com.onsr.pothole.dto;

/** Une entrée de l'historique des connexions d'un utilisateur (de quelle heure à quelle heure). */
public class UserSessionResponse {

    private String id;
    private long loginAtMs;
    private Long logoutAtMs;
    private boolean ongoing;
    private long durationMs;
    private String endReason;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public long getLoginAtMs() {
        return loginAtMs;
    }

    public void setLoginAtMs(long loginAtMs) {
        this.loginAtMs = loginAtMs;
    }

    public Long getLogoutAtMs() {
        return logoutAtMs;
    }

    public void setLogoutAtMs(Long logoutAtMs) {
        this.logoutAtMs = logoutAtMs;
    }

    public boolean isOngoing() {
        return ongoing;
    }

    public void setOngoing(boolean ongoing) {
        this.ongoing = ongoing;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public String getEndReason() {
        return endReason;
    }

    public void setEndReason(String endReason) {
        this.endReason = endReason;
    }
}
