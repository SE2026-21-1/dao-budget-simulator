# VM demo trên OpenStack/Kolla-Ansible

Cloud được triển khai bằng **Kolla-Ansible**; xem [hồ sơ lớp cloud](../kolla/README.md).
Module Terraform này khai báo tài nguyên tenant, không triển khai lại OpenStack.
Runbook ứng dụng: [Netlify + OpenStack + Anvil](../../docs/openstack-anvil-demo.md).

## Phạm vi

- Một Ubuntu 22.04 VM; flavor có sẵn 2 vCPU, 2048 MiB RAM, 20 GiB disk Nova.
- Network/subnet/router, security group, SSH public key, port và floating IP.
- Project, member role, flavor, image và provider network là đầu vào có sẵn.
- Chỉ SSH/ICMP từ management CIDR; không mở ingress API, PostgreSQL hay Anvil.
- Cloud-init cài Docker/Compose/Git trên VM mới, không chứa secret hay deploy app.
- `prevent_destroy` bảo vệ tài nguyên lõi; không tháo bảo vệ để vượt plan thay VM.
- Terraform không sinh private key. State, plan, tfvars và credentials phải giữ riêng.

## Điều kiện đầu vào

Dùng Terraform >=1.9; OpenStack provider 3.x. Credentials ở `OS_*` hoặc
clouds.yaml ngoài repo. Cloud operator cấp project `dao-budget-demo`, role member
cho user vận hành, flavor `dao-demo-2c2g20` với quyền dùng trong project, image Ubuntu
và quyền dùng provider network. Chỉ tạo khi tài nguyên chưa có:

```bash
openstack project create --domain default --description "DAO Budget Simulator isolated demo" dao-budget-demo
openstack role add --project dao-budget-demo --user OPERATOR_USER_ID member
openstack flavor create --private --project dao-budget-demo --vcpus 2 --ram 2048 --disk 20 dao-demo-2c2g20
```

Chuyển credentials sang đúng project demo trước khi Terraform chạy. Xác nhận token:

```bash
openstack token issue -f value -c project_id
cd infra/openstack
cp terraform.tfvars.example terraform.tfvars
# Sửa ID và đường dẫn PUBLIC key theo cloud của bạn.
terraform init
terraform validate
```

Commit `.terraform.lock.hcl` sau khi review provider đã tải; không commit tfvars,
tfstate hoặc plan. Quota không thay thế dung lượng thật trên host Kolla: lab khoảng
8 GiB RAM chỉ bố trí một VM 2 GiB sau khi giải phóng đủ RAM.

## Nhận quản lý VM đang chạy: import trước, không tạo trùng

Các ID dưới đây lấy từ đầu ra vận hành ngày 2026-11-25, không phải live discovery.
Đối chiếu CLI trước khi import; không dùng ID này cho cloud khác.

```bash
terraform import openstack_networking_network_v2.demo 942ca6b3-a33e-479a-a1f5-0a1942ecb740
terraform import openstack_networking_subnet_v2.demo 7a154ee5-9c08-43fd-9aeb-21b895501ee0
terraform import openstack_networking_router_v2.demo 27c2787d-9500-40a9-beaf-5750a7c43d52
terraform import openstack_networking_secgroup_v2.demo e11a89d6-2061-48e2-9815-0cb1874c5fdd
terraform import openstack_compute_keypair_v2.demo dao-demo-key
terraform import openstack_networking_port_v2.demo 2842c03b-756d-436d-9f63-61127acb0110
terraform import openstack_compute_instance_v2.demo b9a59903-b03e-47b4-8b87-5a62e58c909e
terraform import openstack_networking_floatingip_v2.demo 0fb2837b-3236-417b-862c-e73b8106009d
terraform import openstack_networking_floatingip_associate_v2.demo 0fb2837b-3236-417b-862c-e73b8106009d
```

Lấy ID router-interface port và hai ingress rule từ cloud, không đoán:

```bash
openstack port list --router dao-demo-router --long
openstack security group rule list dao-demo-sg --long
# Thay các chữ IN HOA bằng ID vừa đối chiếu:
terraform import openstack_networking_router_interface_v2.demo ROUTER_INTERFACE_PORT_ID
terraform import openstack_networking_secgroup_rule_v2.ssh SSH_RULE_ID
terraform import openstack_networking_secgroup_rule_v2.icmp ICMP_RULE_ID
terraform plan
```

Chọn port router nối subnet `10.20.30.0/24`, rule ingress IPv4 TCP/22 và ICMP
từ `192.168.248.1/32`. Egress mặc định được giữ. Import không đảm bảo plan rỗng:
đối chiếu name/description, network/port representation, image/flavor và keypair
với state. Nếu plan thay VM/port/network hoặc báo prevent_destroy, dừng chỉnh
khai báo cho khớp tài nguyên thực; không force recreate. `user_data` được bỏ qua
khi cập nhật để không thay VM chỉ nhằm bổ sung cloud-init.

## Tạo trên project mới chưa có tài nguyên demo

Điền tfvars của cloud mới và public key tạo bên ngoài Terraform. Sau khi xác thực
đúng project: `terraform plan -out=demo.tfplan`, review rồi
`terraform apply demo.tfplan`. Không có auto-apply trong CI. Trên VM mới, chờ
`sudo cloud-init status --wait` và kiểm tra Docker trước triển khai ứng dụng.
Không dùng quy trình tạo mới cho VM đã có dữ liệu.

Provider network `public` trong lab là RFC1918. Floating IP `192.168.248.217`
không phải IP Internet; không trỏ bản ghi A public vào đó. Không quản lý/xóa
public network, lab Terraform cũ, Signify, Docker volumes Kolla hay DNS Netlify.

Tham chiếu: https://registry.terraform.io/providers/terraform-provider-openstack/openstack/latest/docs
