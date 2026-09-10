package com.onsr.pothole.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.convert.MongoCustomConversions;

import java.time.Instant;
import java.util.Date;

@Configuration
public class MongoConfig {

    @Bean
    public MongoCustomConversions mongoCustomConversions() {
        return MongoCustomConversions.create(config -> {
            config.registerConverter((Date source) -> source.toInstant());
            config.registerConverter((Instant source) -> Date.from(source));
        });
    }
}
