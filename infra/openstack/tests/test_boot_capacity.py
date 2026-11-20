"""Exercise real Terraform/provider plans against an isolated synthetic HTTP cloud.

No cloud credentials, mocks of Terraform expressions, state writes or apply.
Provider 3.2.0's Optional-only lookup outputs cannot be set by override_data.
"""
import json
import os
from pathlib import Path
import subprocess
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
IDS = {name: str(index) * 8 + '-1111-4111-8111-' + str(index) * 12
       for index, name in enumerate(['project', 'image', 'flavor', 'network', 'subnet', 'router'], 1)}


class Cloud(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, body, status=200, **headers):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        for name, value in headers.items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        if self.path != '/v3/auth/tokens':
            self.server.unexpected.append(('POST', self.path))
            return self.reply({'error': 'No cloud writes allowed'}, 405)
        self.rfile.read(int(self.headers.get('Content-Length', 0)))
        base = f'http://127.0.0.1:{self.server.server_port}'
        endpoints = [('identity', '/v3'), ('compute', '/compute/v2.1'),
                     ('network', '/network'), ('image', '/image')]
        self.reply({'token': {
            'expires_at': '2099-01-01T00:00:00Z', 'issued_at': '2026-01-01T00:00:00Z',
            'project': {'id': IDS['project'], 'name': 'dao-staging-test', 'domain': {'id': 'default'}},
            'user': {'id': 'synthetic-user', 'name': 'synthetic-user', 'domain': {'id': 'default'}},
            'roles': [{'name': 'member'}], 'methods': ['password'],
            'catalog': [{'id': kind, 'type': kind, 'name': kind,
                         'endpoints': [{'id': kind, 'interface': 'public', 'region': 'RegionOne',
                                        'url': base + suffix}]} for kind, suffix in endpoints]
        }}, 201, **{'X-Subject-Token': 'synthetic-local-token'})

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/v3/projects/' + IDS['project']:
            return self.reply({'project': {'id': IDS['project'], 'name': 'dao-staging-test', 'enabled': True}})
        if path == '/image/v2/images':
            image = {'id': IDS['image'], 'name': 'ubuntu24.04', 'status': 'active',
                     'visibility': 'public', 'owner': IDS['project'], 'container_format': 'bare',
                     'disk_format': 'qcow2', 'min_disk': self.server.image_min, 'min_ram': 1024,
                     'os_distro': 'ubuntu', 'os_version': '24.04', 'architecture': 'x86_64'}
            return self.reply({'images': [image]})
        if path == '/compute/v2.1/flavors/' + IDS['flavor']:
            return self.reply({'flavor': {'id': IDS['flavor'], 'name': 'synthetic-test',
                                         'disk': self.server.flavor_disk, 'ram': 8192, 'vcpus': 4}})
        if path == '/compute/v2.1/flavors/' + IDS['flavor'] + '/os-extra_specs':
            return self.reply({'extra_specs': {}})
        if path == '/compute/v2.1/os-keypairs/synthetic-test-key':
            return self.reply({'keypair': {'name': 'synthetic-test-key', 'public_key': 'ssh-ed25519 synthetic', 'fingerprint': 'synthetic'}})
        for resource, kind in [('networks', 'network'), ('subnets', 'subnet'), ('routers', 'router')]:
            if path in ['/network/v2.0/' + resource, '/network/v2.0/' + resource + '/' + IDS[kind]]:
                value = {'id': IDS[kind], 'name': 'synthetic-test', 'tenant_id': IDS['project'],
                         'project_id': IDS['project'], 'network_id': IDS['network'], 'ip_version': 4,
                         'cidr': '192.0.2.0/24', 'gateway_ip': '192.0.2.1', 'enable_dhcp': True}
                return self.reply({resource: [value]} if path.endswith('/' + resource) else {kind: value})
        self.server.unexpected.append(('GET', self.path))
        self.reply({'error': 'Unexpected request'}, 404)


class BootCapacity(unittest.TestCase):
    def plan(self, *, image_min, flavor_disk, volume=False, requested=30, profile='demo'):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Cloud)
        server.image_min, server.flavor_disk, server.unexpected = image_min, flavor_disk, []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        env = {key: value for key, value in os.environ.items()
               if not key.startswith(('OS_', 'TF_', 'AWS_'))}
        env.update(OS_AUTH_URL=f'http://127.0.0.1:{server.server_port}/v3',
                   OS_USERNAME='synthetic-user', OS_PASSWORD='synthetic-test-only',
                   OS_USER_DOMAIN_NAME='Default', OS_PROJECT_DOMAIN_NAME='Default',
                   OS_PROJECT_ID=IDS['project'], OS_REGION_NAME='RegionOne', CHECKPOINT_DISABLE='1')
        variables = {key + '_id': value for key, value in IDS.items()}
        variables.update(keypair_name='synthetic-test-key', admin_cidr='192.0.2.1/32',
                         profile=profile, root_disk_gb=requested, boot_from_volume=str(volume).lower())
        args = ['terraform', 'plan', '-input=false', '-lock=false', '-no-color']
        for key, value in variables.items():
            args += ['-var', f'{key}={value}']
        try:
            result = subprocess.run(args, cwd=ROOT, env=env, text=True,
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
            self.assertEqual(server.unexpected, [], result.stdout)
            return result
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def accepted(self, **kwargs):
        result = self.plan(**kwargs)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn('Plan: 5 to add, 0 to change, 0 to destroy.', result.stdout)

    def rejected(self, **kwargs):
        result = self.plan(**kwargs)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('fit the actual flavor root disk or provisioned boot volume', result.stdout)
        self.assertIn('Resource postcondition failed', result.stdout)

    def test_local_35_on_40_with_30_floor(self):
        self.accepted(image_min=35, flavor_disk=40)

    def test_local_image_exceeds_actual_disk(self):
        self.rejected(image_min=41, flavor_disk=40)

    def test_volume_uses_requested_size_not_flavor_disk(self):
        self.rejected(image_min=35, flavor_disk=40, volume=True)

    def test_volume_exact_boundary(self):
        self.accepted(image_min=35, flavor_disk=40, volume=True, requested=35)

    def test_standard_exact_100_is_supported(self):
        self.accepted(image_min=100, flavor_disk=100, requested=100, profile='standard')


if __name__ == '__main__':
    unittest.main()
