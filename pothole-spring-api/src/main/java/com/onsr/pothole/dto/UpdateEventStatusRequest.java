package com.onsr.pothole.dto;

import com.onsr.pothole.model.EventStatus;
import jakarta.validation.constraints.NotNull;

public class UpdateEventStatusRequest {

    @NotNull
    private EventStatus status;

    private String note;

    public EventStatus getStatus() {
        return status;
    }

    public void setStatus(EventStatus status) {
        this.status = status;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
