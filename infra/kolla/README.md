# OpenStack triển khai bằng Kolla-Ansible

Cloud của demo này do **Kolla-Ansible** triển khai, theo mô hình lab all-in-one.
Kolla-Ansible vận hành control plane và compute trong container; Terraform ở
`../openstack` chỉ quản lý tài nguyên tenant qua API OpenStack. Đây là hai lớp khác nhau.

## Thông tin đã quan sát từ terminal ngày 2026-11-25

- Host lab có khoảng 7,7 GiB RAM; chỉ cấp một VM demo 2 GiB sau khi giải phóng RAM.
- Có Nova, Placement, Neutron/OVS, Glance, Keystone, Horizon,
  MariaDB, RabbitMQ, HAProxy/Keepalived và các container Kolla liên quan.
- Nova compute mount `/var/lib/docker/volumes/nova_compute/_data` vào
  `/var/lib/nova`; `state_path = /var/lib/nova`.
- Không có endpoint block-storage trong catalog được kiểm tra; không dùng Cinder.
- Provider network `public`: `192.168.248.0/24`; host truy cập qua `br-ex`,
  source `192.168.248.1`. Floating IP lab không phải địa chỉ Internet public.

## Giới hạn của bản khai báo

Chưa thu thập version Kolla-Ansible/OpenStack, inventory gốc và globals.yml đã
redact. Vì vậy repo không giả định release, tên NIC hay dựng globals.yml giả làm
bản cấu hình thực tế. Không chạy `kolla-ansible deploy/reconfigure/destroy` từ repo này.

Trên máy quản trị, kiểm tra read-only để hoàn thiện hồ sơ khi cần:

```bash
kolla-ansible --version
openstack --version
openstack compute service list
openstack network agent list
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
sudo docker exec nova_compute grep -E '^[[:space:]]*(state_path|instances_path|images_type)[[:space:]]*=' /etc/nova/nova.conf
```

Không commit `/etc/kolla/passwords.yml`, admin-openrc, clouds.yaml có credentials,
private key, cấu hình có token hay full `docker inspect` chứa environment secrets.
Không dọn Docker volume trên host Kolla để giải phóng dung lượng VM.

Tài liệu chính thức: https://docs.openstack.org/kolla-ansible/latest/
