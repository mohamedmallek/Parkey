package com.onsr.pothole.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Cors cors = new Cors();
    private Ml ml = new Ml();
    private Mail mail = new Mail();
    private Sla sla = new Sla();

    public Jwt getJwt() {
        return jwt;
    }

    public void setJwt(Jwt jwt) {
        this.jwt = jwt;
    }

    public Cors getCors() {
        return cors;
    }

    public void setCors(Cors cors) {
        this.cors = cors;
    }

    public Ml getMl() {
        return ml;
    }

    public void setMl(Ml ml) {
        this.ml = ml;
    }

    public Mail getMail() {
        return mail;
    }

    public void setMail(Mail mail) {
        this.mail = mail;
    }

    public Sla getSla() {
        return sla;
    }

    public void setSla(Sla sla) {
        this.sla = sla;
    }

    public static class Jwt {
        private String secret;
        private long expirationMs;

        public String getSecret() {
            return secret;
        }

        public void setSecret(String secret) {
            this.secret = secret;
        }

        public long getExpirationMs() {
            return expirationMs;
        }

        public void setExpirationMs(long expirationMs) {
            this.expirationMs = expirationMs;
        }
    }

    public static class Cors {
        private String allowedOrigins;

        public String getAllowedOrigins() {
            return allowedOrigins;
        }

        public void setAllowedOrigins(String allowedOrigins) {
            this.allowedOrigins = allowedOrigins;
        }
    }

    public static class Ml {
        private String baseUrl;

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }
    }

    public static class Mail {
        private boolean enabled = true;
        private String from;
        private String fromName;
        private String appUrl;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getFrom() {
            return from;
        }

        public void setFrom(String from) {
            this.from = from;
        }

        public String getFromName() {
            return fromName;
        }

        public void setFromName(String fromName) {
            this.fromName = fromName;
        }

        public String getAppUrl() {
            return appUrl;
        }

        public void setAppUrl(String appUrl) {
            this.appUrl = appUrl;
        }
    }

    /** Délais cibles (SLA) de traitement d'un dossier, en heures, par niveau de gravité. */
    public static class Sla {
        private long criticalHours = 48;
        private long highHours = 120;
        private long mediumHours = 360;
        private long lowHours = 720;

        public long getCriticalHours() {
            return criticalHours;
        }

        public void setCriticalHours(long criticalHours) {
            this.criticalHours = criticalHours;
        }

        public long getHighHours() {
            return highHours;
        }

        public void setHighHours(long highHours) {
            this.highHours = highHours;
        }

        public long getMediumHours() {
            return mediumHours;
        }

        public void setMediumHours(long mediumHours) {
            this.mediumHours = mediumHours;
        }

        public long getLowHours() {
            return lowHours;
        }

        public void setLowHours(long lowHours) {
            this.lowHours = lowHours;
        }
    }
}
