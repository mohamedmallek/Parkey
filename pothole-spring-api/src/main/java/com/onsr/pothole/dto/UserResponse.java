package com.onsr.pothole.dto;

import com.onsr.pothole.model.Role;
import com.onsr.pothole.model.User;

import java.time.Instant;

public class UserResponse {

    private String id;
    private String email;
    private String fullName;
    private Role role;
    private boolean enabled;
    private Instant createdAt;

    public static UserResponse from(User user) {
        UserResponse r = new UserResponse();
        r.id = user.getId();
        r.email = user.getEmail();
        r.fullName = user.getFullName();
        r.role = user.getRole();
        r.enabled = user.isEnabled();
        r.createdAt = user.getCreatedAt();
        return r;
    }

    public String getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getFullName() {
        return fullName;
    }

    public Role getRole() {
        return role;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
