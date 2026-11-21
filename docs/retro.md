# Retro nhóm

## Phase 2 (nhanh)
- Điều tốt: chốt sớm giao diện chuyển pha (`GatherSim(day, oxygen_max_s, hp_max)` → kho đếm trong bộ nhớ → `QuanSim(menu_filter, …)` → `ShopSim`) nên hai lát gather và day làm song song mà ghép không vỡ; pause làm một lần ở `runner.Session` dùng chung cho ba mode và cho `chonoi.live`; một Ngày headless chạy 0.76 s (giới hạn 20 s).
- Điều tệ / bị kẹt: 4 test P1 vỡ vì số chuẩn (4 bàn, 8 đàn, nút `attack` hợp lệ, `--mode day`) phải sửa kèm lý do; ticket mơ hồ ở nhiều chỗ (mẫu scenario mỗi Ngày, resume có nhận cạnh không, event tick 0 trước/sau snapshot) → 21 giả định trong `docs/clarify.md` chưa được PO xác nhận; phần UI (menu, DayIntro, HUD, pause menu) chưa làm.
- 1 hành động cho Phase 3: **Duyet (PO)** mang C-P2-B02, C-P2-B04, C-P2-B05 hỏi giảng viên đầu Phase 3 và cập nhật test nếu câu trả lời khác giả định.

## Phase 4 (cuối) — Release v1.0.0

### Rà lại hành động đã chốt ở retro Phase 2
Hành động: **Duyet (PO)** mang C-P2-B02, C-P2-B04, C-P2-B05 hỏi giảng viên đầu Phase 3 và cập nhật test nếu câu trả lời khác giả định.
- **Đã làm gì:** cả ba vẫn nằm trong [`docs/clarify.md`](clarify.md) với cách hiểu của nhóm; test AC-P2-72 viết theo giả định C-P2-B05 và đang đạt.
- **Còn kẹt:** chưa có câu trả lời của giảng viên được ghi lại; C-P2-B04 vẫn ghi "Nhóm (cần hỏi PO)". Vì vậy chưa có test nào phải đổi, nhưng cũng chưa chắc test ẩn đồng ý với ta.
- **Vì sao:** đầu Phase 3 cả nhóm dồn vào breaking change độ tươi (TICKET-03) nên việc hỏi bị đẩy lùi; hành động có người làm nhưng không có mốc giờ và không có chỗ ghi "đã hỏi lúc nào".
- **Sửa:** PO điền cột trả lời trong `clarify.md` (hoặc ghi "không hỏi kịp") trước khi gắn `phase-4`; từ nay mỗi hành động retro có người, mốc giờ và nơi ghi kết quả.

### Điều tốt
- Hợp đồng là nguồn sự thật: sim headless, test và client đọc cùng `game.contract.json`, đổi số chuẩn ở một chỗ.
- Mỗi breaking change (v1.1, v1.2) có CHANGELOG, ma trận truy vết và lý do sửa test ghi ngay tại test, nên regression P1–P2 vẫn chạy.
- Bản GUI chạy không cần backend: một lệnh `python3 -m http.server` là chơi được; đóng gói Release bằng `bash tools/package.sh`.

### Cần sửa
- Agent báo "xong" khi tính năng mới chỉ qua test headless; phải chơi thử trên trình duyệt mới thấy lỗi (xem phần AI sai bên dưới).
- Hai lát song song cùng sửa một file test (đã nêu ở Phase 3) vẫn lặp lại ở client: nhiều agent cùng sửa `client/src` gây khó ghép.
- Ghi chép (retro, phản tư cá nhân) dồn về cuối giờ.

### Một lần AI sai và cách nhóm kiểm chứng
1. **Commit không ai yêu cầu.** Một agent tự tạo commit cục bộ khi nhóm chỉ yêu cầu sửa file. Phát hiện khi xem `git log` trước khi push: có commit lạ không đúng phân công. Gỡ bằng `git reset --soft HEAD~1` (giữ nguyên thay đổi, bỏ commit), rồi người phụ trách tự commit đúng phần việc. Từ đó quy tắc: agent không được chạy lệnh git ghi.
2. **Client sập khi hợp đồng đổi kiểu dữ liệu.** Hợp đồng chuyển `fish_initial` từ danh sách sang một số (v1.1: 8 đàn sinh theo seed), test headless vẫn xanh nhưng client đọc `fish_initial` như mảng nên màn lặn hỏng. Chỉ phát hiện khi mở trình duyệt chơi thử; sửa client đọc theo kiểu mới rồi chơi lại để xác nhận.
3. **"Xong" nhưng chỉ test headless.** Vì hai lỗi trên, nhóm thêm bước bắt buộc: mỗi tính năng client phải được chơi thử trên trình duyệt (mở `client/index.html` qua `http.server`, đi hết vòng lặn → quán → chợ) trước khi đánh dấu xong.

### Số liệu
- Commit từ khi fork (`git shortlog -sne f0a1906..HEAD`, lúc viết): hxlinh 18 · cduyminh 12 · NMinh-123 1 · usVNno1TH 1. Ánh xạ tài khoản Git ↔ người trong `TEAM.md` do từng thành viên xác nhận trong `docs/members/`.
- Đọc code của nhau: nhánh ngắn theo module, xem trực tiếp trước khi gộp; AI dùng để review nhưng người gộp chạy lại test.
- Token theo người: ghi trong [`docs/ai-usage-log.md`](ai-usage-log.md) (mỗi người tự điền).

### Đóng góp từng người (bằng chứng trong repo)
Mỗi người tự điền dòng của mình; chi tiết và phản tư ở `docs/members/<handle>.md`.

| Thành viên | Vai | Phần việc chính | Bằng chứng |
|---|---|---|---|
| Cao Duy Minh (`workcaominh-gif`) | Integrator, `sim/gather` | Ghép code các lát và gắn tag `phase-1`–`phase-4`, phát hành Release v1.0.0; điều phối agent làm luật lặn/quán (P1–P3), bench + soak (P4), bản GUI (lặn có lao móc và vùng sâu, quán nhà bè, vòng Ngày, chợ Chú Sáu, nhân viên, trang trí, âm thanh), ảnh/video demo; gộp commit của Duyet và Nhật Minh vào `main` sau khi chạy lại test | Tag `37f371d` `4951d27` `ae814d2` `1a9bf8d`; Release v1.0.0; `docs/media/`; 25 commit `cduyminh` + 18 commit `hxlinh` (Phase 1–2, tạo từ máy của Minh); [phản tư](members/workcaominh-gif.md) |
| Duyet (`theduythg`) | PO, `sim/quan` | _(Duyet tự điền)_ | [phản tư](members/theduythg.md) |
| Nhật Minh | QA lead / Release, `client/ui` + `qa` | _(Nhật Minh tự điền)_ | [phản tư](members/NMinh-123.md) |
| Vũ Đình Huy (`VNno1TH`) | Dev, `sim/gather` | Phase 2: Test Contract v1.1 (số chuẩn, 6 nguyên liệu, 6 món, day_plan D1–D5, shop), luật lặn gather v1.1 (cá bơi/sinh theo seed, Cá Sấu Năm Chèo, Máu/ngất, nút kèo nèo), test AC-P2-01…29 | Đồng tác giả `2ecd98f` `494381d` `2c43c8b` (commit `hxlinh`); [phản tư](members/VNno1TH.md) |

### Hành động tiếp theo (nếu làm lại)
- PO chốt câu hỏi mở với giảng viên trong 10 phút đầu mỗi phase, ghi giờ hỏi và câu trả lời.
- Chia quyền sở hữu file (test, `client/src/*`) trước khi giao việc cho agent song song.
- Định nghĩa "xong" = test headless xanh **và** chơi thử trên trình duyệt **và** ghi bằng chứng.

## Retro Phase 3 (đổi kho)
- Tốt: helper độ tươi đơn vị nguyên (240/điểm) chốt sớm ở `inventory.py` → gather và quán dùng chung, ngưỡng 30/floor chính xác.
- Tốt: lớp chuyển fixture giữ được regression P1–P2 mà không viết lại hàng loạt test.
- Cần cải thiện: hai lát cùng sửa test smoke P1 song song; lần sau chốt người sở hữu từng file test trước khi chia việc.
