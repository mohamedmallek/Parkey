# ---- Etape 1 : build avec Maven Wrapper ----
FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app

# Cache des dependances Maven
COPY .mvn/ .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B dependency:go-offline || true

# Build de l'application (les tests sont deja executes dans le pipeline CI)
COPY src ./src
RUN ./mvnw -B -q clean package -DskipTests

# ---- Etape 2 : image d'execution ----
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
