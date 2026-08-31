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

import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
public class MlProxyService {

    private final RestTemplate restTemplate;
    private final AppProperties appProperties;
    private final EventService eventService;

    public MlProxyService(AppProperties appProperties, EventService eventService) {
        this.restTemplate = new RestTemplate();
        this.appProperties = appProperties;
        this.eventService = eventService;
    }

    @SuppressWarnings("unchecked")
    public ResponseEntity<Object> forwardMultipart(
            String path,
            MultipartHttpServletRequest request,
            String userId) {

        String url = appProperties.getMl().getBaseUrl() + path;
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

        if (response.getBody() != null) {
            persistEventsFromMlResponse(response.getBody(), userId);
        }

        return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
    }

  @SuppressWarnings("unchecked")
    public ResponseEntity<Object> forwardGet(String path) {
        String url = appProperties.getMl().getBaseUrl() + path;
        ResponseEntity<Object> response = restTemplate.exchange(url, HttpMethod.GET, null, Object.class);
        return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
    }

    public ResponseEntity<byte[]> forwardFrame(String eventId) {
        String url = appProperties.getMl().getBaseUrl() + "/events/frame/" + eventId;
        try {
            ResponseEntity<byte[]> response = restTemplate.exchange(url, HttpMethod.GET, null, byte[].class);
            HttpHeaders out = new HttpHeaders();
            MediaType contentType = response.getHeaders().getContentType();
            out.setContentType(contentType != null ? contentType : MediaType.IMAGE_JPEG);
            return new ResponseEntity<>(response.getBody(), out, response.getStatusCode());
        } catch (org.springframework.web.client.HttpStatusCodeException e) {
            return ResponseEntity.status(e.getStatusCode()).build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).build();
        }
    }

    public void deleteFrames(java.util.List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return;
        }
        try {
            String url = appProperties.getMl().getBaseUrl() + "/events/delete-batch";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(Map.of("ids", ids), headers);
            restTemplate.postForEntity(url, entity, Object.class);
        } catch (Exception ignored) {
            // Les fichiers IA sont optionnels : la suppression Mongo reste valide.
        }
    }

    @SuppressWarnings("unchecked")
    private void persistEventsFromMlResponse(Map<String, Object> body, String userId) {
        Object events = body.get("events");
        if (events instanceof List<?> list && !list.isEmpty()) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    eventService.saveFromApiMap((Map<String, Object>) map, userId);
                }
            }
            return;
        }
        Object event = body.get("event");
        if (event instanceof Map<?, ?> map) {
            eventService.saveFromApiMap((Map<String, Object>) map, userId);
            return;
        }
        if (body.get("events") == null && body.containsKey("label") && Boolean.TRUE.equals(body.get("alert"))) {
            eventService.saveFromApiMap(body, userId);
        }
    }
}
