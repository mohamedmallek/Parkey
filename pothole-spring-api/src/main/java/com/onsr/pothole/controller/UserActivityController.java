package com.onsr.pothole.controller;

import com.onsr.pothole.dto.UserActivityResponse;
import com.onsr.pothole.security.UserPrincipal;
import com.onsr.pothole.service.UserActivityService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Suivi d'activité des comptes, réservé aux Superadmin/Admin (voir SecurityConfig). */
@RestController
@RequestMapping("/api/admin/user-activity")
public class UserActivityController {

    private final UserActivityService userActivityService;

    public UserActivityController(UserActivityService userActivityService) {
        this.userActivityService = userActivityService;
    }

    @GetMapping
    public ResponseEntity<Map<String, List<UserActivityResponse>>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(Map.of(
                "users", userActivityService.listActivity(principal.getRole(), principal.getUserId())));
    }

    @GetMapping("/{userId}/sessions")
    public ResponseEntity<Map<String, Object>> sessions(
            @PathVariable String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                userActivityService.listSessions(userId, principal.getRole(), principal.getUserId(), page, size));
    }
}
