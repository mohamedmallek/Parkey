package com.onsr.pothole;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.onsr.pothole.config.AppProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class PotholeApplication {

    public static void main(String[] args) {
        SpringApplication.run(PotholeApplication.class, args);
    }
}
