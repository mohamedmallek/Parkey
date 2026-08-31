package com.onsr.pothole.controller;

import com.onsr.pothole.security.UserPrincipal;
import com.onsr.pothole.service.MlProxyService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartHttpServletRequest;

@RestController
public class MlProxyController {

    private final MlProxyService mlProxyService;

    public MlProxyController(MlProxyService mlProxyService) {
        this.mlProxyService = mlProxyService;
    }

    @GetMapping("/api/models")
    public ResponseEntity<Object> models() {
        return mlProxyService.forwardGet("/models");
    }

    @PostMapping("/api/predict")
    public ResponseEntity<Object> predict(
            MultipartHttpServletRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return mlProxyService.forwardMultipart("/predict", request, principal.getUserId());
    }

    @PostMapping("/api/video/analyze")
    public ResponseEntity<Object> analyzeVideo(
            MultipartHttpServletRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return mlProxyService.forwardMultipart("/video/analyze", request, principal.getUserId());
    }

    @GetMapping("/api/events/frame/{eventId}")
    public ResponseEntity<byte[]> eventFrame(@PathVariable String eventId) {
        return mlProxyService.forwardFrame(eventId);
    }
}
