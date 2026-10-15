import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { hostname, networkInterfaces } from 'os';

/**
 * The raw identifier of the machine the SDK runs on: the `deviceId` of every order.
 *
 * Nobody configures one: the SDK reads the operating system's own machine id and sends it as
 * is, so the same machine always has the same `deviceId` (nothing is hashed or invented).
 *
 * Sources, first that works: macOS `IOPlatformUUID`, Linux `/etc/machine-id`, Windows
 * `MachineGuid`; then the network card's MAC address, or the host name when the system can
 * only offer a zero/random address.
 */

function macosUuid(): string | undefined {
  try {
    const out = execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) {
      if (line.includes('IOPlatformUUID')) {
        const value = line.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '');
        return value || undefined;
      }
    }
  } catch {
    // fall through
  }
  return undefined;
}

function linuxMachineId(): string | undefined {
  for (const name of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const value = readFileSync(name, 'ascii').trim();
      if (value) return value;
    } catch {
      // try the next one
    }
  }
  return undefined;
}

function windowsMachineGuid(): string | undefined {
  try {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const out = execFileSync(
      `${systemRoot}\\System32\\reg.exe`,
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    const match = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

function macOrHost(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const nic of list ?? []) {
      const mac = nic.mac;
      if (!nic.internal && mac && mac !== '00:00:00:00:00:00') return mac;
    }
  }
  return hostname() || 'unknown-host';
}

function machineSource(): string {
  let found: string | undefined;
  if (process.platform === 'darwin') found = macosUuid();
  else if (process.platform === 'linux') found = linuxMachineId();
  else if (process.platform === 'win32' || process.platform === 'cygwin') found = windowsMachineGuid();
  return found || macOrHost();
}

let cached: string | undefined;

/** The raw machine id of this computer. Read once per process. */
export function getDeviceId(): string {
  if (cached === undefined) cached = machineSource();
  return cached;
}
