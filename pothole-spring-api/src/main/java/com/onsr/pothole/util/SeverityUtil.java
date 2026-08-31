package com.onsr.pothole.util;

public final class SeverityUtil {

    private SeverityUtil() {}

    public static String compute(Boolean alert, Double prob) {
        return compute(alert, prob, null);
    }

    public static String compute(Boolean alert, Double prob, String sizeClass) {
        double p = prob != null ? prob : 0.0;
        boolean a = Boolean.TRUE.equals(alert);

        if (sizeClass != null) {
            if ("XL".equalsIgnoreCase(sizeClass)) {
                return "CRITIQUE";
            }
            if ("L".equalsIgnoreCase(sizeClass) && (a || p >= 0.5)) {
                return "CRITIQUE";
            }
        }

        if (a && p >= 0.85) {
            return "CRITIQUE";
        }
        if (a || p >= 0.7) {
            return "ELEVEE";
        }
        if ("M".equalsIgnoreCase(sizeClass) && p >= 0.5) {
            return "ELEVEE";
        }
        if (p >= 0.5) {
            return "MOYENNE";
        }
        return "FAIBLE";
    }
}
