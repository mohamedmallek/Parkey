package com.onsr.pothole.service;

import com.onsr.pothole.config.AppProperties;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class BudgetService {

    private final RestTemplate restTemplate;
    private final AppProperties appProperties;
    private final EventService eventService;

    public BudgetService(AppProperties appProperties, EventService eventService) {
        this.restTemplate = new RestTemplate();
        this.appProperties = appProperties;
        this.eventService = eventService;
    }

    public ResponseEntity<Object> getStatus() {
        String url = appProperties.getMl().getBaseUrl() + "/budget/status";
        ResponseEntity<Object> response = restTemplate.exchange(url, HttpMethod.GET, null, Object.class);
        return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> estimate(MultipartHttpServletRequest request) {
        String url = appProperties.getMl().getBaseUrl() + "/budget/estimate";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        for (Map.Entry<String, List<MultipartFile>> entry : request.getMultiFileMap().entrySet()) {
            for (MultipartFile file : entry.getValue()) {
                try {
                    Resource resource = new ByteArrayResource(file.getBytes()) {
                        @Override
                        public String getFilename() {
                            return file.getOriginalFilename();
                        }
                    };
                    body.add(entry.getKey(), resource);
                } catch (Exception e) {
                    throw new IllegalStateException("Lecture fichier échouée", e);
                }
            }
        }
        request.getParameterMap().forEach((key, values) -> {
            if (values != null) {
                for (String v : values) {
                    body.add(key, v);
                }
            }
        });

        HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);

        Map<String, Object> result = new HashMap<>();
        if (response.getBody() != null) {
            result.putAll(response.getBody());
        }

        String eventId = request.getParameter("event_id");
        Object budgetObj = result.get("budget_estimate");
        if (eventId != null && !eventId.isBlank() && budgetObj instanceof Map<?, ?> budgetMap) {
            Map<String, Object> updated = eventService.applyBudgetEstimate(
                    eventId.trim(),
                    (Map<String, Object>) budgetMap);
            result.put("event", updated);
        }

        return result;
    }
}
