package com.onsr.pothole.dto;

import com.onsr.pothole.model.Role;

/**
 * Ligne du tableau de suivi d'activité (Superadmin/Admin) : un utilisateur,
 * son statut en direct (en ligne ou non) et son temps d'utilisation.
 */
public class UserActivityResponse {

    private String id;
    private String fullName;
    private String email;
    private Role role;
    private boolean enabled;
    private boolean online;
    private Long lastLoginAtMs;
    private Long lastSeenAtMs;
    private long todayActiveMs;
    private int sessionsCount;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isOnline() {
        return online;
    }

    public void setOnline(boolean online) {
        this.online = online;
    }

    public Long getLastLoginAtMs() {
        return lastLoginAtMs;
    }

    public void setLastLoginAtMs(Long lastLoginAtMs) {
        this.lastLoginAtMs = lastLoginAtMs;
    }

    public Long getLastSeenAtMs() {
        return lastSeenAtMs;
    }

    public void setLastSeenAtMs(Long lastSeenAtMs) {
        this.lastSeenAtMs = lastSeenAtMs;
    }

    public long getTodayActiveMs() {
        return todayActiveMs;
    }

    public void setTodayActiveMs(long todayActiveMs) {
        this.todayActiveMs = todayActiveMs;
    }

    public int getSessionsCount() {
        return sessionsCount;
    }

    public void setSessionsCount(int sessionsCount) {
        this.sessionsCount = sessionsCount;
    }
}
