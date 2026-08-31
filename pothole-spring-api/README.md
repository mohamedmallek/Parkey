# ONSR — Backend Spring Boot + MongoDB

API principale de l'application **ONSR Surveillance routière** :
- **Authentification JWT**
- **Gestion des utilisateurs** (rôles ADMIN / OPERATOR / VIEWER)
- **Événements** persistés dans **MongoDB**
- **Proxy IA** vers le service Python Flask (modèles, prédiction image, analyse vidéo)

## Architecture

```
Angular (4200)  →  Spring Boot (8080)  →  MongoDB
                         ↓
                  Flask ML (5000)
```

| Service | Port | Rôle |
|---------|------|------|
| Angular | 4200 | Interface |
| Spring Boot | 8080 | Auth, users, events, proxy ML |
| MongoDB | 27017 | Données |
| Flask | 5000 | Inférence IA (ResNet, YOLO) |

## Prérequis

- Java 17+
- Maven 3.9+ (ou IntelliJ IDEA)
- MongoDB en local ou URI cloud (Atlas)
- Service Python `pothole_dash_api` démarré sur le port 5000

## Démarrage MongoDB (local)

```powershell
# Avec Docker
docker run -d -p 27017:27017 --name onsr-mongo mongo:7

# Ou installer MongoDB Community sur Windows
```

## Lancer l'API Spring

```powershell
cd C:\Users\DELL\pothole-spring-api
.\mvnw.cmd spring-boot:run
```

> **Pas besoin d'installer Maven** : le projet inclut `mvnw.cmd` (Maven Wrapper).

Variables d'environnement optionnelles :

| Variable | Défaut |
|----------|--------|
| `MONGODB_URI` | `mongodb://localhost:27017/onsr_pothole` |
| `JWT_SECRET` | (dev — à changer en prod) |
| `ML_SERVICE_URL` | `http://127.0.0.1:5000` |
| `ADMIN_EMAIL` | `admin@onsr.local` |
| `ADMIN_PASSWORD` | `Admin123!` |

## Compte admin initial

Au premier démarrage (base vide) :

- **Email :** `admin@onsr.local`
- **Mot de passe :** `Admin123!`

## Endpoints

### Public
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/health` | Santé API |
| POST | `/api/auth/login` | Connexion → JWT |

### Authentifié
| Méthode | URL | Rôles |
|---------|-----|-------|
| GET | `/api/auth/me` | Tous |
| GET | `/api/models` | Tous |
| GET | `/api/events` | Tous |
| GET | `/api/events/export.json` | Tous |
| POST | `/api/predict` | ADMIN, OPERATOR |
| POST | `/api/video/analyze` | ADMIN, OPERATOR |

### Admin uniquement
| Méthode | URL |
|---------|-----|
| GET/POST | `/api/users` |
| GET/PATCH/DELETE | `/api/users/{id}` |

### Exemple login

```http
POST /api/auth/login
Content-Type: application/json

{"email":"admin@onsr.local","password":"Admin123!"}
```

Réponse :
```json
{
  "token": "eyJ...",
  "tokenType": "Bearer",
  "user": { "id": "...", "email": "admin@onsr.local", "role": "ADMIN", ... }
}
```

En-tête pour les requêtes suivantes :
```
Authorization: Bearer <token>
```

## Rôles

| Rôle | Droits |
|------|--------|
| **ADMIN** | Utilisateurs + analyse + lecture |
| **OPERATOR** | Analyse image/vidéo + lecture événements |
| **VIEWER** | Lecture événements uniquement |

## Stack

- Spring Boot 3.2
- Spring Security + JWT (jjwt)
- Spring Data MongoDB
- RestTemplate → proxy Flask

## Angular

Le proxy pointe vers `http://127.0.0.1:8080`. Écran de connexion intégré au dashboard.

Ordre de démarrage :
1. MongoDB
2. `python api.py` (Flask, port 5000)
3. `.\mvnw.cmd spring-boot:run` (port 8080)
4. `ng serve` (port 4200)

## Configuration email (SMTP)

Pour envoyer les identifiants aux nouveaux utilisateurs, configurez SMTP avant de créer des comptes :

```powershell
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="votre.email@gmail.com"
$env:SMTP_PASS="mot-de-passe-application"   # Gmail : mot de passe d'application
$env:MAIL_FROM="votre.email@gmail.com"
$env:APP_URL="http://localhost:4200"
cd C:\Users\DELL\pothole-spring-api
.\mvnw.cmd spring-boot:run
```

**Gmail :** activez la validation en 2 étapes puis créez un [mot de passe d'application](https://myaccount.google.com/apppasswords).

L'admin crée des comptes **OPERATOR** ou **VIEWER** depuis le dashboard ; un email avec email + mot de passe est envoyé automatiquement.
