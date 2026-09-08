#!/usr/bin/env node
'use strict';

/**
 * Attend le resultat de l'analyse SonarQube puis verifie le Quality Gate.
 *
 * Utilise le fichier target/sonar/report-task.txt genere par le
 * sonar-maven-plugin (contient l'URL du serveur et l'id de la tache
 * d'analyse cote SonarQube), puis interroge l'API SonarQube :
 *   1. GET /api/ce/task?id=<ceTaskId>          -> attend le statut SUCCESS
 *   2. GET /api/qualitygates/project_status    -> verifie le statut OK
 *
 * Variables d'environnement (fournies par withSonarQubeEnv dans le
 * Jenkinsfile) :
 *   SONAR_HOST_URL   - URL du serveur SonarQube
 *   SONAR_AUTH_TOKEN - token d'authentification (ou SONAR_TOKEN)
 *
 * Sort avec le code 1 si l'analyse echoue ou si le Quality Gate n'est pas OK.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const REPORT_TASK_FILE = path.join(process.cwd(), 'target', 'sonar', 'report-task.txt');
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 5 * 60 * 1000;

function readReportTask(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Fichier report-task.txt introuvable : ${filePath}. ` +
      "L'analyse SonarQube (mvn sonar:sonar) a-t-elle bien ete executee avant ce script ?"
    );
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const props = {};
  content.split('\n').forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > -1) {
      props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  });
  return props;
}

function httpGetJson(urlString, token) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const client = target.protocol === 'https:' ? https : http;
    const options = {
      headers: token
        ? { Authorization: 'Basic ' + Buffer.from(`${token}:`).toString('base64') }
        : {},
    };
    client
      .get(target, options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode} sur ${urlString} : ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Reponse JSON invalide depuis ${urlString} : ${err.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCeTask(serverUrl, taskId, token) {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const payload = await httpGetJson(`${serverUrl}/api/ce/task?id=${taskId}`, token);
    const status = payload.task && payload.task.status;
    console.log(`Statut de la tache d'analyse SonarQube : ${status}`);

    if (status === 'SUCCESS') {
      return payload.task.analysisId;
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(`La tache d'analyse SonarQube a echoue (statut ${status}).`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Delai depasse en attendant la fin de l'analyse SonarQube.");
}

async function checkQualityGate(serverUrl, analysisId, token) {
  const payload = await httpGetJson(
    `${serverUrl}/api/qualitygates/project_status?analysisId=${analysisId}`,
    token
  );
  const status = payload.projectStatus && payload.projectStatus.status;
  console.log(`Statut du Quality Gate SonarQube : ${status}`);

  if (status !== 'OK') {
    console.error(JSON.stringify(payload.projectStatus, null, 2));
    throw new Error(`Quality Gate SonarQube non valide (statut ${status}).`);
  }
}

async function main() {
  const props = readReportTask(REPORT_TASK_FILE);
  const serverUrl = (process.env.SONAR_HOST_URL || props.serverUrl || '').replace(/\/$/, '');
  const token = process.env.SONAR_AUTH_TOKEN || process.env.SONAR_TOKEN || '';
  const taskId = props.ceTaskId;

  if (!serverUrl) {
    throw new Error("SONAR_HOST_URL introuvable (ni variable d'environnement, ni report-task.txt).");
  }
  if (!taskId) {
    throw new Error('ceTaskId introuvable dans report-task.txt.');
  }

  console.log(`Attente du resultat de l'analyse SonarQube (task ${taskId}) sur ${serverUrl}...`);
  const analysisId = await waitForCeTask(serverUrl, taskId, token);
  await checkQualityGate(serverUrl, analysisId, token);
  console.log('Quality Gate SonarQube : OK.');
}

main().catch((err) => {
  console.error(`ERREUR : ${err.message}`);
  process.exitCode = 1;
});
