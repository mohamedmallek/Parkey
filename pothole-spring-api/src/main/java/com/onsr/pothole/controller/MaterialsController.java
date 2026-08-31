package com.onsr.pothole.controller;

import com.onsr.pothole.service.MaterialsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.util.Map;

@RestController
@RequestMapping("/api/materials")
public class MaterialsController {

    private final MaterialsService materialsService;

    public MaterialsController(MaterialsService materialsService) {
        this.materialsService = materialsService;
    }

    @GetMapping("/status")
    public ResponseEntity<Object> status() {
        return materialsService.getStatus();
    }

    @PostMapping("/analyze")
    public ResponseEntity<Map<String, Object>> analyze(MultipartHttpServletRequest request) {
        return ResponseEntity.ok(materialsService.analyze(request));
    }
}
