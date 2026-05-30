import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BuildArtifactsSpec {
  version: string;
  paths: {
    targetRoot: string;
    targetTauri: string;
    targetRelease: string;
    targetDebug: string;
    rustAnalyzer: string;
    desktopSource: string;
    desktopBuild: string;
    gitbutlerTauriCrate: string;
    nodeModules: string;
    pnpmStore: string;
    turboCache: string;
    turboCacheKey: string;
    viteCacheDefault: string;
    viteCacheChanneled: string;
  };
  cargo: {
    targetDir: string;
    defaultTargetDir: string;
    devTargetDir: string;
    releaseTargetDir: string;
    cargoConfigPath: string;
    expectedTargetDir: string;
  };
  components: {
    desktop: {
      rustBinaryName: string;
      outputs: { debug: string; release: string };
      bundleOutput: string;
    };
    but: {
      rustBinaryName: string;
      outputs: { debug: string; release: string };
    };
    butServer: {
      rustBinaryName: string;
      outputs: { debug: string; release: string };
    };
    gitbutlerGit: {
      rustBinaryName: string;
      outputs: { debug: string; release: string };
    };
    sidecar: {
      sourceDir: string;
      injectDir: string;
      binaries: { askpass: string; but: string };
      namingPatterns: string[];
      windowsNamingPatterns: string[];
      integrityManifest: string;
    };
    frontend: {
      sourceDir: string;
      outputDir: string;
      buildManifest: string;
    };
  };
  channels: Record<string, {
    profile: string;
    targetDir: string;
    cargoTargetDir: string;
    bundle: boolean;
    requiredBinaries: string[];
  }>;
  cleanScopes: Record<string, string>;
  validation: {
    strictMode: boolean;
    failOnStaleArtifacts: boolean;
    failOnMissingArtifacts: boolean;
    failOnCacheMismatch: boolean;
    mtimeGraceSeconds: number;
  };
}

let cachedSpec: BuildArtifactsSpec | null = null;
let specPath: string | null = null;

export function findSpecFile(startDir?: string): string {
  if (specPath && existsSync(specPath)) {
    return specPath;
  }

  let current = startDir || dirname(fileURLToPath(import.meta.url));
  while (current !== '/' && current !== '') {
    const candidate = join(current, 'build-artifacts.spec.json');
    if (existsSync(candidate)) {
      specPath = candidate;
      return candidate;
    }
    current = dirname(current);
  }

  throw new Error('build-artifacts.spec.json not found in parent directories');
}

export function loadSpec(startDir?: string): BuildArtifactsSpec {
  if (cachedSpec) {
    return cachedSpec;
  }

  const path = findSpecFile(startDir);
  cachedSpec = JSON.parse(readFileSync(path, 'utf-8')) as BuildArtifactsSpec;
  return cachedSpec;
}

export function resetSpecCache(): void {
  cachedSpec = null;
  specPath = null;
}

export function substituteVars(
  template: string,
  vars: { triple?: string; channel?: string; profile?: string } = {}
): string {
  let result = template;
  if (vars.triple) result = result.replace(/\$\{TRIPLE\}/g, vars.triple);
  if (vars.channel) result = result.replace(/\$\{CHANNEL\}/g, vars.channel);
  if (vars.profile) result = result.replace(/\$\{PROFILE\}/g, vars.profile);
  return result;
}

export function getChannelConfig(channel: string, spec?: BuildArtifactsSpec) {
  const s = spec || loadSpec();
  return s.channels[channel] || s.channels.dev;
}

export function getViteCacheDir(channel?: string, spec?: BuildArtifactsSpec): string {
  const s = spec || loadSpec();
  if (channel && s.channels[channel]) {
    return substituteVars(s.paths.viteCacheChanneled, { channel });
  }
  return s.paths.viteCacheDefault;
}

export function getFrontendOutputDir(spec?: BuildArtifactsSpec): string {
  const s = spec || loadSpec();
  return s.components.frontend.outputDir;
}

export function getSidecarInjectDir(spec?: BuildArtifactsSpec): string {
  const s = spec || loadSpec();
  return s.components.sidecar.injectDir;
}

export function getIntegrityManifestPath(spec?: BuildArtifactsSpec): string {
  const s = spec || loadSpec();
  return join(s.components.sidecar.injectDir, s.components.sidecar.integrityManifest);
}

export function getBuildManifestPath(spec?: BuildArtifactsSpec): string {
  const s = spec || loadSpec();
  return join(s.components.frontend.outputDir, s.components.frontend.buildManifest);
}

export function getCargoTargetDir(channel?: string, spec?: BuildArtifactsSpec): string {
  const s = spec || loadSpec();
  if (channel && s.channels[channel]) {
    return s.channels[channel].cargoTargetDir;
  }
  return s.cargo.targetDir;
}

export function getTurboCacheDir(spec?: BuildArtifactsSpec): string {
  const s = spec || loadSpec();
  return s.paths.turboCache;
}

export function getTurboCacheKey(channel?: string, profile?: string, spec?: BuildArtifactsSpec): string {
  const s = spec || loadSpec();
  const ch = channel || 'dev';
  const pr = profile || 'debug';
  return substituteVars(s.paths.turboCacheKey, { channel: ch, profile: pr });
}

export function getRustBinaryPath(
  component: 'desktop' | 'but' | 'butServer' | 'gitbutlerGit',
  profile: 'debug' | 'release' = 'debug',
  vars: { triple?: string; channel?: string } = {},
  spec?: BuildArtifactsSpec
): string {
  const s = spec || loadSpec();
  const comp = s.components[component];
  if (!comp) throw new Error(`Unknown component: ${component}`);
  const template = comp.outputs[profile];
  if (!template) throw new Error(`No output path for ${component} profile=${profile}`);
  return substituteVars(template, { ...vars, profile });
}

export function getBundleOutputDir(
  vars: { triple?: string; channel?: string; profile?: string } = {},
  spec?: BuildArtifactsSpec
): string {
  const s = spec || loadSpec();
  return substituteVars(s.components.desktop.bundleOutput, vars);
}

const COMPONENT_MAP: Record<string, 'desktop' | 'but' | 'butServer' | 'gitbutlerGit'> = {
  'gitbutler-tauri': 'desktop',
  'but': 'but',
  'but-server': 'butServer',
  'gitbutler-git-askpass': 'gitbutlerGit',
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateArtifacts(
  channel: string,
  vars: { triple?: string } = {},
  spec?: BuildArtifactsSpec
): ValidationResult {
  const s = spec || loadSpec();
  const channelConfig = s.channels[channel];
  if (!channelConfig) {
    return { valid: false, errors: [`Unknown channel: ${channel}`], warnings: [] };
  }

  const profile = channelConfig.profile;
  const errors: string[] = [];
  const warnings: string[] = [];
  const specDir = dirname(findSpecFile());

  for (const binName of channelConfig.requiredBinaries) {
    const component = COMPONENT_MAP[binName];
    if (!component) {
      errors.push(`Unknown required binary: ${binName}`);
      continue;
    }

    const relPath = getRustBinaryPath(component, profile as 'debug' | 'release', { ...vars, channel, profile }, s);
    const absPath = resolve(specDir, relPath);

    if (!existsSync(absPath)) {
      errors.push(`${binName}: NOT FOUND at ${relPath}`);
    }
  }

  if (channelConfig.bundle) {
    const sidecarDir = substituteVars(s.components.sidecar.injectDir, { ...vars, channel, profile });
    const manifestPath = resolve(specDir, sidecarDir, s.components.sidecar.integrityManifest);
    if (!existsSync(manifestPath)) {
      errors.push(`sidecar integrity manifest: NOT FOUND at ${manifestPath}`);
    }
  }

  const feOutputDir = substituteVars(s.components.frontend.outputDir, { ...vars, channel, profile });
  const feManifestPath = resolve(specDir, feOutputDir, s.components.frontend.buildManifest);
  if (existsSync(feManifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(feManifestPath, 'utf-8'));
      if (manifest.channel !== channel) {
        warnings.push(`frontend manifest channel=${manifest.channel} != current channel=${channel} (stale cache)`);
      }
      if (manifest.profile !== profile) {
        warnings.push(`frontend manifest profile=${manifest.profile} != current profile=${profile} (stale cache)`);
      }
    } catch {
      warnings.push(`frontend manifest: could not parse ${feManifestPath}`);
    }
  } else if (channel === 'dev' || channel === 'development') {
    errors.push(`frontend build manifest: NOT FOUND at ${feManifestPath}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function getCleanPatterns(
  scope: string,
  vars: { triple?: string; channel?: string; profile?: string } = {},
  spec?: BuildArtifactsSpec
): string[] {
  const s = spec || loadSpec();
  const cleanRules = (s as any).cleanRules;
  if (!cleanRules || !cleanRules[scope]) {
    return [];
  }

  const patterns: string[] = [];
  for (const rule of cleanRules[scope]) {
    if (rule.includes(' + ')) {
      const parts = rule.split(' + ').map((p: string) => {
        const trimmed = p.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1);
        }
        return resolvePath(trimmed, vars, s);
      });
      patterns.push(substituteVars(parts.join(''), vars));
    } else if (rule.startsWith('paths.') || rule.startsWith('components.') || rule.startsWith('cargo.')) {
      patterns.push(resolvePath(rule, vars, s));
    } else {
      patterns.push(substituteVars(rule, vars));
    }
  }

  return patterns.filter(Boolean);
}

function resolvePath(
  pathRef: string,
  vars: { triple?: string; channel?: string; profile?: string },
  spec: BuildArtifactsSpec
): string {
  const parts = pathRef.split('.');
  let current: any = spec;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return pathRef;
    }
  }

  if (typeof current === 'string') {
    return substituteVars(current, vars);
  }
  if (Array.isArray(current)) {
    return current.map((p: string) => substituteVars(p, vars)).join('\n');
  }
  return pathRef;
}
