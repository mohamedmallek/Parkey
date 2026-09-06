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

            String roleLabel = switch (role) {
                case SUPERADMIN -> "Superadmin";
                case ADMIN -> "Administrateur";
                case OPERATOR -> "Opérateur";
                case VIEWER -> "Lecteur";
            };
            String appUrl = trimSlash(appProperties.getMail().getAppUrl());
            String loginUrl = appUrl + "/?welcome=1&email=" + java.net.URLEncoder.encode(toEmail, java.nio.charset.StandardCharsets.UTF_8);
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
                """.formatted(fullName, roleLabel, toEmail, plainPassword, loginUrl);

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
                """.formatted(safeName, roleLabel, safeEmail, safePassword, roleLabel, escapeHtml(loginUrl));

            helper.setText(textBody, html);
            mailSender.send(message);
            log.info("Email d'accès envoyé à {}", toEmail);
            return true;
        } catch (Exception e) {
            log.error("Échec envoi email à {}: {}", toEmail, e.getMessage());
            return false;
        }
    }

    public boolean sendPasswordReset(String toEmail, String fullName, String rawToken) {
        if (!appProperties.getMail().isEnabled()) {
            log.warn("Envoi email désactivé (app.mail.enabled=false)");
            return false;
        }
        if (!StringUtils.hasText(appProperties.getMail().getFrom())) {
            log.warn("SMTP non configuré : définissez SMTP_USER et SMTP_PASS");
            return false;
        }

        String firstName = firstName(fullName);
        String greeting = StringUtils.hasText(firstName) ? "Bonjour " + firstName : "Bonjour";
        String appUrl = trimSlash(appProperties.getMail().getAppUrl());
        String resetUrl = appUrl + "/reset-password?token=" + rawToken;
        String logoUrl = appUrl + "/assets/images/logo-parkey.jpg";

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(appProperties.getMail().getFrom(), appProperties.getMail().getFromName());
            helper.setTo(toEmail);
            helper.setSubject("Changez votre mot de passe Parkey");

            String textBody = """
                %s,

                Vous avez demandé à changer le mot de passe de votre compte Parkey.

                Ouvrez ce lien pour choisir un nouveau mot de passe (valable 1 heure) :
                %s

                Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail.
                """.formatted(greeting, resetUrl);

            String html = """
                <div style="background:#eef3f8;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
                  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e6eb;border-radius:20px;overflow:hidden">
                    <div style="padding:28px 28px 8px;text-align:center">
                      <img src="%s" alt="Parkey" width="72" style="border-radius:12px;display:block;margin:0 auto 12px" />
                      <h1 style="margin:0;font-size:22px;color:#111111">Parkey</h1>
                    </div>
                    <div style="padding:8px 28px 32px;color:#1a2332">
                      <p style="font-size:16px;margin:0 0 12px">%s,</p>
                      <p style="margin:0 0 16px;line-height:1.55;color:#5b6573">
                        Vous avez demandé à changer le mot de passe de votre compte.
                        Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
                      </p>
                      <p style="text-align:center;margin:28px 0">
                        <a href="%s" style="background:#2dbee6;color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block;font-weight:700;font-size:15px">
                          Changer le mot de passe
                        </a>
                      </p>
                      <p style="font-size:13px;color:#5b6573;margin:0 0 8px">Ce lien expire dans <strong>1 heure</strong>.</p>
                      <p style="font-size:13px;color:#94a3b8;margin:0">Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>
                    </div>
                  </div>
                </div>
                """.formatted(escapeHtml(logoUrl), escapeHtml(greeting), escapeHtml(resetUrl));

            helper.setText(textBody, html);
            mailSender.send(message);
            log.info("Email de réinitialisation envoyé à {}", toEmail);
            return true;
        } catch (Exception e) {
            log.error("Échec envoi email de réinitialisation à {}: {}", toEmail, e.getMessage());
            return false;
        }
    }

    private static String firstName(String fullName) {
        if (!StringUtils.hasText(fullName)) {
            return "";
        }
        return fullName.trim().split("\\s+")[0];
    }

    private static String trimSlash(String url) {
        if (!StringUtils.hasText(url)) {
            return "http://localhost:4200";
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
