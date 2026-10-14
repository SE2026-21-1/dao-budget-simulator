function DashboardPage() {
  return (
    <div>
      {/* Tiêu đề */}
      <h2 className="text-3xl font-bold text-slate-800">
        Dashboard
      </h2>

      <p className="mt-2 text-gray-500">
        Tổng quan hệ thống quản lý ngân sách DAO
      </p>

      {/* Các thẻ thống kê */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-gray-500">
            Số dư Treasury
          </p>

          <h3 className="mt-3 text-2xl font-bold">
            10.000 BUD
          </h3>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-gray-500">
            Tổng đề xuất
          </p>

          <h3 className="mt-3 text-2xl font-bold">
            0
          </h3>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-gray-500">
            Đã thực thi
          </p>

          <h3 className="mt-3 text-2xl font-bold">
            0
          </h3>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-gray-500">
            Tổng BUD đã chi
          </p>

          <h3 className="mt-3 text-2xl font-bold">
            0 BUD
          </h3>
        </div>

      </div>

      {/* Danh sách đề xuất */}
      <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
        <h3 className="text-xl font-bold">
          Danh sách đề xuất gần đây
        </h3>

        <p className="mt-5 text-gray-500">
          Chưa có đề xuất nào.
        </p>
      </section>

      <p className="mt-6 text-sm text-gray-500">
        Môi trường mô phỏng - Dữ liệu demo
      </p>
    </div>
  );
}

export default DashboardPage;