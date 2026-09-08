package com.onsr.pothole.service;

import com.onsr.pothole.config.AppProperties;
import com.onsr.pothole.model.Role;
import jakarta.mail.internet.MimeMessage;
import org.springframework.core.io.ClassPathResource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * E-mails envoyés aux comptes ONSR/Parkey : création de compte (identifiants)
 * et réinitialisation de mot de passe. Les deux partagent le même habillage
 * visuel (logo Parkey, carte blanche arrondie, couleurs de la charte de
 * l'application) via {@link #emailShell}, pour que toute la communication
 * de l'application soit reconnaissable au premier coup d'œil.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    /** Couleurs reprises de la charte Parkey (voir styles.scss côté Angular). */
    private static final String COLOR_PRIMARY = "#2dbee6";
    private static final String COLOR_TEXT = "#1a2332";
    private static final String COLOR_TEXT_MUTED = "#5b6573";
    private static final String COLOR_TEXT_FAINT = "#94a3b8";
    private static final String COLOR_PAGE_BG = "#eef3f8";
    private static final String COLOR_CARD_BORDER = "#e2e6eb";
    private static final String COLOR_FIELD_BG = "#f8fafc";

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

        String roleLabel = switch (role) {
            case SUPERADMIN -> "Superadmin";
            case ADMIN -> "Administrateur";
            case OPERATOR -> "Opérateur";
            case VIEWER -> "Lecteur";
        };
        String appUrl = trimSlash(appProperties.getMail().getAppUrl());
        String loginUrl = appUrl + "/?welcome=1&email=" + java.net.URLEncoder.encode(toEmail, java.nio.charset.StandardCharsets.UTF_8);
        String firstName = firstName(fullName);
        String greeting = StringUtils.hasText(firstName) ? "Bonjour " + firstName : "Bonjour";

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(appProperties.getMail().getFrom(), appProperties.getMail().getFromName());
            helper.setTo(toEmail);
            helper.setSubject("Votre compte Parkey — accès à la plateforme");

            String textBody = """
                %s,

                Votre compte Parkey (%s) a été créé.

                Email : %s
                Mot de passe : %s

                Connexion : %s

                Copiez le mot de passe sans espaces ni retour à la ligne.
                """.formatted(greeting, roleLabel, toEmail, plainPassword, loginUrl);

            String body = """
                <p style="font-size:16px;margin:0 0 12px">%s,</p>
                <p style="margin:0 0 20px;line-height:1.55;color:%s">
                  Un compte <strong>%s</strong> vient d’être créé pour vous sur <strong>Parkey</strong>,
                  la plateforme de surveillance et de suivi de l’état des routes.
                </p>
                <table role="presentation" width="100%%" style="border-collapse:collapse;background:%s;border:1px solid %s;border-radius:14px">
                  <tr>
                    <td style="padding:16px 20px;font-size:13px;color:%s;width:120px">Email</td>
                    <td style="padding:16px 20px 16px 0;font-size:14px;color:%s;font-weight:600">%s</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;font-size:13px;color:%s;border-top:1px solid %s">Mot de passe</td>
                    <td style="padding:0 20px 16px 0;border-top:1px solid %s">
                      <span style="font-family:Consolas,Menlo,monospace;font-size:16px;letter-spacing:1px;background:#ffffff;border:1px dashed %s;border-radius:8px;padding:6px 10px;display:inline-block">%s</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;font-size:13px;color:%s;border-top:1px solid %s">Rôle</td>
                    <td style="padding:0 20px 16px 0;font-size:14px;color:%s;font-weight:600;border-top:1px solid %s">%s</td>
                  </tr>
                </table>
                <p style="font-size:13px;color:%s;margin:12px 0 0">Copiez le mot de passe tel quel, sans espace ni retour à la ligne.</p>
                <p style="text-align:center;margin:28px 0 8px">
                  <a href="%s" style="background:%s;color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block;font-weight:700;font-size:15px">
                    Se connecter à Parkey
                  </a>
                </p>
                <p style="font-size:13px;color:%s;margin:16px 0 0">
                  Pour votre sécurité, changez ce mot de passe dès votre première connexion.
                </p>
                """.formatted(
                    escapeHtml(greeting),
                    COLOR_TEXT_MUTED,
                    escapeHtml(roleLabel),
                    COLOR_FIELD_BG, COLOR_CARD_BORDER,
                    COLOR_TEXT_MUTED,
                    COLOR_TEXT, escapeHtml(toEmail),
                    COLOR_TEXT_MUTED, COLOR_CARD_BORDER,
                    COLOR_CARD_BORDER,
                    COLOR_PRIMARY, escapeHtml(plainPassword),
                    COLOR_TEXT_MUTED, COLOR_CARD_BORDER,
                    COLOR_TEXT, COLOR_CARD_BORDER, escapeHtml(roleLabel),
                    COLOR_TEXT_FAINT,
                    escapeHtml(loginUrl), COLOR_PRIMARY,
                    COLOR_TEXT_FAINT);

            String html = emailShell(body);

            helper.setText(textBody, html);
            helper.addInline("logoParkey", new ClassPathResource("email/logo-parkey.png"), "image/png");
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

            String body = """
                <p style="font-size:16px;margin:0 0 12px">%s,</p>
                <p style="margin:0 0 16px;line-height:1.55;color:%s">
                  Vous avez demandé à changer le mot de passe de votre compte.
                  Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
                </p>
                <p style="text-align:center;margin:28px 0">
                  <a href="%s" style="background:%s;color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block;font-weight:700;font-size:15px">
                    Changer le mot de passe
                  </a>
                </p>
                <p style="font-size:13px;color:%s;margin:0 0 8px">Ce lien expire dans <strong>1 heure</strong>.</p>
                <p style="font-size:13px;color:%s;margin:0">Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>
                """.formatted(
                    escapeHtml(greeting),
                    COLOR_TEXT_MUTED,
                    escapeHtml(resetUrl), COLOR_PRIMARY,
                    COLOR_TEXT_MUTED,
                    COLOR_TEXT_FAINT);

            String html = emailShell(body);

            helper.setText(textBody, html);
            helper.addInline("logoParkey", new ClassPathResource("email/logo-parkey.png"), "image/png");
            mailSender.send(message);
            log.info("Email de réinitialisation envoyé à {}", toEmail);
            return true;
        } catch (Exception e) {
            log.error("Échec envoi email de réinitialisation à {}: {}", toEmail, e.getMessage());
            return false;
        }
    }

    /**
     * Habillage commun à tous les e-mails Parkey : logo de l'application,
     * carte blanche arrondie sur fond clair, pied de page. `bodyHtml` est le
     * contenu propre à chaque e-mail (déjà échappé côté appelant).
     */
    private static String emailShell(String bodyHtml) {
        return """
            <div style="background:%s;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
              <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid %s;border-radius:20px;overflow:hidden">
                <div style="padding:32px 28px 8px;text-align:center">
                  <img src="cid:logoParkey" alt="Parkey" width="88" style="display:block;margin:0 auto" />
                </div>
                <div style="padding:12px 28px 32px;color:%s">
                  %s
                </div>
                <div style="padding:16px 28px;border-top:1px solid %s;text-align:center">
                  <p style="font-size:12px;color:%s;margin:0">Parkey — surveillance et suivi de l’état des routes</p>
                </div>
              </div>
            </div>
            """.formatted(COLOR_PAGE_BG, COLOR_CARD_BORDER, COLOR_TEXT, bodyHtml, COLOR_CARD_BORDER, COLOR_TEXT_FAINT);
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
