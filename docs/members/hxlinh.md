# hxlinh — Hoàng Xuân Lĩnh (Dev, `sim/gather` + `sim/quan`)

> Thành viên tự viết (≤ 200 từ). File này chỉ là khung; không ai viết hộ, kể cả AI.

## Phần mình làm
- Phase 1: luật buổi sáng `gather` (bơi, oxy, ngạt, hái, bắt cá, cập bến) và buổi tối `quan` (khách, giữ chỗ, bếp, phục vụ, boa, uy tín), 35 test AC; hợp đồng kho, ma trận truy vết, bằng chứng chạy, làm rõ C-01…C-08.
- Phase 2: Test Contract v1.1, gather v1.1, quán v1.1, chế độ `day`, pause, Shop; tài liệu Phase 2.
- Client GUI: bản chơi đầu tiên, rồi quán nhà bè, lặn bằng lao móc, nhạc/giọng, vòng Ngày.

## Đã giúp ai
- Dựng TEAM.md, README và bản GUI đầu tiên để cả nhóm làm tiếp trên đó.

## AI sai ở đâu
- Lab board không xuất được text, AI chép từ ảnh nên mất vài dòng cuối; phải ghi rõ "không đọc được".
- Ticket Phase 2 nhiều chỗ mơ hồ (thứ tự RNG, phản xạ, recoil), AI tự chọn mà không báo; phải chốt thành giả định C-P2-A01…A10.

## Bài học
Chỗ mơ hồ phải ghi `clarify.md`. Test headless xanh chưa phải là xong.

## Commit & bằng chứng
`c8708a7` gather P1 · `76d14b6` quán P1 · `66665f2` docs P1 · `2ecd98f` contract v1.1 · `494381d` gather v1.1 · `064b396` quán v1.1 · `e1fdb79` day · `001f348` CLI/pause · `37f371d` GUI · `4951d27` vòng Ngày; bằng chứng ở `docs/proof/phase-1`, `docs/proof/phase-2`, `docs/verification/`.
