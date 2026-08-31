package com.onsr.pothole.service;

import com.onsr.pothole.config.AppProperties;
import com.onsr.pothole.model.Role;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;
    private final AppProperties appProperties;

    public EmailService(JavaMailSender mailSender, AppProperties appProperties) {
        this.mailSender = mailSender;
        this.appProperties = appProperties;
    }

    public boolean sendAccountCredentials(String toEmail, String fullName, Role role, String plainPassword) {
        if (!appProperties.getMail().isEnabled()) {
            log.warn("Envoi email désactivé (app.mail.enabled=false)");
            return false;
        }
        if (!StringUtils.hasText(appProperties.getMail().getFrom())) {
            log.warn("SMTP non configuré : définissez SMTP_USER et SMTP_PASS");
            return false;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(appProperties.getMail().getFrom(), appProperties.getMail().getFromName());
            helper.setTo(toEmail);
            helper.setSubject("Votre compte ONSR — Surveillance routière");

            String roleLabel = role == Role.OPERATOR ? "Opérateur" : "Lecteur (Viewer)";
            String appUrl = appProperties.getMail().getAppUrl();
            String safeName = escapeHtml(fullName);
            String safeEmail = escapeHtml(toEmail);
            String safePassword = escapeHtml(plainPassword);

            String textBody = """
                Bonjour %s,

                Votre compte ONSR (%s) a été créé.

                Email : %s
                Mot de passe : %s

                Connexion : %s

                Copiez le mot de passe sans espaces ni retour à la ligne.
                """.formatted(fullName, roleLabel, toEmail, plainPassword, appUrl);

            String html = """
                <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
                  <h2 style="color:#1e3a5f">ONSR — Surveillance routière</h2>
                  <p>Bonjour <strong>%s</strong>,</p>
                  <p>Un compte <strong>%s</strong> a été créé pour vous sur la plateforme ONSR.</p>
                  <table style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;width:100%%">
                    <tr><td style="padding:6px 0"><strong>Email :</strong></td><td>%s</td></tr>
                    <tr><td style="padding:6px 0"><strong>Mot de passe :</strong></td>
                        <td style="font-family:Consolas,monospace;font-size:16px;letter-spacing:1px;user-select:all">%s</td></tr>
                    <tr><td style="padding:6px 0"><strong>Rôle :</strong></td><td>%s</td></tr>
                  </table>
                  <p style="font-size:12px;color:#64748b;margin-top:12px">Copiez le mot de passe tel quel, sans espaces.</p>
                  <p style="margin-top:20px">
                    <a href="%s" style="background:#0d9488;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
                      Se connecter
                    </a>
                  </p>
                </div>
                """.formatted(safeName, roleLabel, safeEmail, safePassword, roleLabel, appUrl);

            helper.setText(textBody, html);
            mailSender.send(message);
            log.info("Email d'accès envoyé à {}", toEmail);
            return true;
        } catch (Exception e) {
            log.error("Échec envoi email à {}: {}", toEmail, e.getMessage());
            return false;
        }
    }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
