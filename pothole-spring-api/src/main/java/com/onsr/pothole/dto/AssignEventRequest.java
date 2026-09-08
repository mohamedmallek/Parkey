package com.onsr.pothole.dto;

/** userId à null ou vide = désassigner le dossier. */
public class AssignEventRequest {

    private String userId;

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }
}
