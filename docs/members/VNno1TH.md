# VNno1TH — Vũ Đình Huy (`sim/gather` v1.1, Test Contract v1.1)

> Phản tư cá nhân (≤ 200 từ). Đồng tác giả Phase 2 cùng `hxlinh` (`usVNno1TH`).

## Phần mình làm
- Phase 2 (TICKET-02 / Test Contract v1.1):
  - Dữ liệu contract v1.1 (số chuẩn, 6 nguyên liệu, 6 món, day_plan D1–D5, shop) trong `game.contract.json`, `chonoi/contract.py`, `chonoi/inventory.py`.
  - Luật `sim/gather` v1.1: cá bơi/sinh theo seed, Cá Sấu Năm Chèo, Máu/ngất, nút kèo nèo (`chonoi/sim/gather.py`).
  - Viết 29 test AC-P2-01…29 (`tests/test_gather_p2.py`), cập nhật AC-P1-18.
- Cập nhật `TEAM.md`, đổi `team_size` 4 → 5 và sửa test AC-P2-01 theo.

## Đã review
- Rà soát các giả định C-P2-A01…A10 trong `docs/clarify.md` (luồng RNG, phản xạ mép, recoil, bất tử 90 tick), đối chiếu `gather.py` và test AC-P2 trước khi gộp.

## AI sai ở đâu
- Ticket Phase 2 mở nhiều chỗ (chu kỳ đổi hướng cá, hit sau recoil), AI tự quyết không báo; mình phát hiện khi đọc test và yêu cầu chốt thành C-P2-A01…A10.
- AC-P1-18 cũ lặn cố định đến cá đứng yên, v1.1 cá bơi theo seed nên vỡ; phải viết lại test cho đúng bản chất thay vì nới điều kiện bừa bãi.

## Bài học
- Chỗ mơ hồ phải ghi `clarify.md` ngay. Test chỉ kiểm hành vi, không khóa cứng cấu hình ngoài lề (như `team_size`).
- Cần chú ý trailer `Co-authored-by` khi làm việc nhóm đa máy.

## Commit & bằng chứng
`2ecd98f` (contract) · `494381d` (gather) · `2c43c8b` (test AC-P2). Bằng chứng: `docs/verification/phase-2.md`, `tests/test_gather_p2.py`.
