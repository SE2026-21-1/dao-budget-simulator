import { Link } from "react-router";

const fields = [
  { label: "Tiêu đề", hint: "5–120 ký tự" },
  { label: "Mô tả", hint: "20–2.000 ký tự", large: true },
  { label: "Địa chỉ nhận", hint: "Địa chỉ ví EVM hợp lệ" },
  { label: "Số tiền BUD", hint: "Lớn hơn 0 · tối đa 18 chữ số thập phân" },
];

function CreateProposalPage() {
  return (
    <div>
      <Link to="/proposals" className="back-link">← Danh sách đề xuất</Link>
      <div className="page-heading">
        <div>
          <p className="page-heading__eyebrow">Tạo đề xuất · Màn hình 04</p>
          <h1>Đề xuất chi ngân sách</h1>
          <p className="page-heading__description">Một đề xuất tương ứng với một khoản chi BUD tới một địa chỉ nhận.</p>
        </div>
      </div>
      <section className="panel form-preview" aria-label="Bản phác thảo biểu mẫu">
        <div className="panel__header"><h2>Thông tin khoản chi</h2></div>
        <p className="notice">Biểu mẫu này đang ở giai đoạn thiết kế. Chưa thể nhập dữ liệu hoặc gửi giao dịch.</p>
        {fields.map((field) => (
          <div className="preview-field" key={field.label}>
            <strong>{field.label}</strong>
            <div className={`preview-box${field.large ? " preview-box--large" : ""}`}>{field.hint}</div>
          </div>
        ))}
        <button className="button-primary" type="button" disabled>Tạo đề xuất</button>
      </section>
    </div>
  );
}

export default CreateProposalPage;
