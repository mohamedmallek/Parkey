package com.onsr.pothole.controller;

import com.onsr.pothole.service.BudgetService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.util.Map;

@RestController
@RequestMapping("/api/budget")
public class BudgetController {

    private final BudgetService budgetService;

    public BudgetController(BudgetService budgetService) {
        this.budgetService = budgetService;
    }

    @GetMapping("/status")
    public ResponseEntity<Object> status() {
        return budgetService.getStatus();
    }

    @PostMapping("/estimate")
    public ResponseEntity<Map<String, Object>> estimate(MultipartHttpServletRequest request) {
        return ResponseEntity.ok(budgetService.estimate(request));
    }
}
