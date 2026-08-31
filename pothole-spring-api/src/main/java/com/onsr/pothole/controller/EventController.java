package com.onsr.pothole.controller;

import com.onsr.pothole.dto.UpdateEventStatusRequest;
import com.onsr.pothole.security.UserPrincipal;
import com.onsr.pothole.service.EventService;
import com.onsr.pothole.service.MlProxyService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/events")
public class EventController {

    private final EventService eventService;
    private final MlProxyService mlProxyService;

    public EventController(EventService eventService, MlProxyService mlProxyService) {
        this.eventService = eventService;
        this.mlProxyService = mlProxyService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String severity) {
        return ResponseEntity.ok(Map.of("events", eventService.list(limit, status, city, severity)));
    }

    @GetMapping("/export.json")
    public ResponseEntity<byte[]> exportJson(@RequestParam(defaultValue = "2000") int limit) {
        byte[] data = eventService.exportJson(limit);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=events.json")
                .contentType(MediaType.APPLICATION_JSON)
                .body(data);
    }

    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> exportCsv(@RequestParam(defaultValue = "2000") int limit) {
        byte[] data = eventService.exportCsv(limit);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=events.csv")
                .contentType(new MediaType("text", "csv"))
                .body(data);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable String id) {
        return ResponseEntity.ok(eventService.getById(id));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(
            @PathVariable String id,
            @Valid @RequestBody UpdateEventStatusRequest body,
            @AuthenticationPrincipal UserPrincipal principal) {
        Map<String, Object> event = eventService.updateStatus(
                id,
                body.getStatus(),
                principal.getUserId(),
                principal.getFullName(),
                principal.getRole().name(),
                body.getNote());
        return ResponseEntity.ok(Map.of("event", event));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        eventService.deleteById(id);
        mlProxyService.deleteFrames(java.util.List.of(id));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bulk-delete")
    public ResponseEntity<Map<String, Object>> bulkDelete(@RequestBody Map<String, Object> body) {
        Object raw = body == null ? null : body.get("ids");
        java.util.List<String> ids = new java.util.ArrayList<>();
        if (raw instanceof java.util.List<?> list) {
            for (Object item : list) {
                if (item != null && !String.valueOf(item).isBlank()) {
                    ids.add(String.valueOf(item));
                }
            }
        }
        if (ids.isEmpty()) {
            throw new IllegalArgumentException("Aucune photo sélectionnée");
        }
        int deleted = eventService.deleteByIds(ids);
        mlProxyService.deleteFrames(ids);
        return ResponseEntity.ok(Map.of("deleted", deleted));
    }
}
