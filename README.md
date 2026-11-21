# MindNest English 3000

Website học **3.751 từ vựng tiếng Anh giao tiếp** bằng giao diện tiếng Việt, xây dựng theo trang tham khảo *MindNest English 3000* (gialinh.page.gd).

- **3.751 từ độc nhất** → **6.976 thẻ từ** theo ngữ cảnh, **49 nhóm chủ đề**, **233 bài học**
- Mỗi thẻ có ảnh minh họa, phiên âm IPA, từ loại, cấp độ CEFR, nghĩa tiếng Việt, cụm từ đi kèm, câu ví dụ + bản dịch
- Lặp lại ngắt quãng **SuperMemo SM-2**, tiến độ lưu trong trình duyệt (`localStorage`)

Đây là trang tĩnh thuần HTML/CSS/JavaScript (ES modules), **không cần build, không có dependency**.

## Chạy trên máy

Yêu cầu: Node.js ≥ 18 (chỉ để chạy server tĩnh và test) — hoặc bất kỳ web server tĩnh nào.

```bash
npm start            # http://localhost:8080
# hoặc: python3 -m http.server 8080
npm test             # kiểm thử SM-2 và bộ dữ liệu
```

> Phải mở qua HTTP (không mở trực tiếp `file://`) vì ứng dụng tải ES modules và `data/vocab.json`.
> Nhận diện giọng nói/micro cần `localhost` hoặc HTTPS.

## Triển khai

Chỉ cần đưa các thư mục `index.html`, `css/`, `js/`, `data/` lên hosting tĩnh bất kỳ:

- **GitHub Pages**: đã có sẵn workflow `.github/workflows/pages.yml`. Vào *Settings → Pages → Source: GitHub Actions*, sau đó push lên `main`.
- **Netlify / Vercel / Cloudflare Pages**: tạo project từ repo, *build command* để trống, *publish directory* là `.`.
- **Hosting PHP/cPanel thông thường**: tải 4 mục trên lên `public_html/`.

Router dùng hash (`#/words`, `#/quiz`…) nên không cần cấu hình rewrite.

## Tính năng

| Mục | Mô tả |
|---|---|
| Tổng quan | Giới thiệu khóa học, số liệu, tiến độ ghi nhớ, việc cần học hôm nay, tình huống, 49 nhóm |
| Bộ 3.751 từ | Duyệt toàn bộ từ, lọc theo cấp độ CEFR / trạng thái nhớ / nhóm, phân trang |
| 49 nhóm chủ đề → 233 bài | Mỗi bài có danh sách thẻ, nút học flashcard / luyện nghe / kiểm tra theo bài |
| Tìm kiếm | Tìm không dấu theo từ tiếng Anh, nghĩa Việt, tên nhóm và bài |
| Flashcards SRS | Thẻ lật 3D, chiều EN→VI hoặc VI→EN, 4 mức chấm (Quên / Khó / Nhớ / Dễ ≈ “không nhớ / nhớ”) cập nhật lịch SM-2, phím tắt `Space`, `1–4` |
| Luyện nghe & Shadowing | Nghe rảnh tay từ + câu ví dụ, lặp lại N lần, khoảng nghỉ để nhại theo, đọc nghĩa Việt, nhận diện giọng nói và ghi âm để so sánh |
| 12 tình huống giao tiếp | Đời sống, du lịch, công sở: nghe cả hội thoại, đóng vai một nhân vật, chấm phát âm |
| Kiểm tra 4 kỹ năng | Nghe (chọn từ nghe được), Nói (đọc to, chấm bằng Speech Recognition), Đọc (chọn nghĩa / điền từ vào câu), Viết (gõ từ theo nghĩa), Tổng hợp. Câu sai được đưa vào lịch ôn SM-2 |
| Từ đã lưu ♥ | Lưu từ bất kỳ, học/kiểm tra riêng danh sách lưu |
| Tiến độ & Cài đặt | % ghi nhớ, phân bố trạng thái, biểu đồ 14 ngày, lịch sử kiểm tra, mục tiêu từ mới/ngày, xuất/nhập JSON, đặt lại |

### SM-2

`js/sm2.js` cài đặt đúng công thức SuperMemo 2: `EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02))`, EF tối thiểu 1.3; lặp lại thành công lần 1 → 1 ngày, lần 2 → 6 ngày, sau đó `interval × EF`. Chấm `q < 3` đặt lại chuỗi lặp và cho ôn lại sau 10 phút. Tiến độ tính theo từ độc nhất (một từ có thể nằm trong nhiều thẻ).

- **Đã thuộc**: từ đang có ít nhất 1 lần nhớ thành công (chưa bị quên lại); trạng thái “Thành thạo” khi khoảng ôn ≥ 21 ngày
- **% ghi nhớ**: trung bình độ bền trí nhớ ước lượng của toàn bộ 3.751 từ (giảm dần khi quá hạn ôn)

## Cấu trúc

```
index.html            khung ứng dụng, điều hướng
css/styles.css        giao diện responsive
js/app.js             router + các trang duyệt/tìm kiếm/tiến độ
js/practice.js        flashcards, luyện nghe, tình huống, kiểm tra
js/sm2.js             thuật toán SM-2 (thuần, có test)
js/store.js           trạng thái người học (localStorage `mindnest.v1`)
js/data.js            tải & lập chỉ mục dữ liệu, tìm kiếm, phạm vi học
js/speech.js          Web Speech API (đọc, nhận diện), ghi âm
js/images.js          ảnh minh họa SVG + ảnh thật từ Wikipedia
js/scenarios.js       12 hội thoại song ngữ
data/vocab.json       dữ liệu chạy (≈1,7 MB, ≈320 KB gzip)
raw/source-vocab.json dữ liệu gốc đầy đủ
scripts/build-data.mjs  tạo data/vocab.json từ raw/  (npm run build:data)
scripts/serve.mjs     server tĩnh không dependency
tests/                node:test cho SM-2 và dữ liệu
```

## Nguồn dữ liệu

Bộ từ (IPA, nghĩa Việt, câu ví dụ, nhóm, bài) được trích từ dữ liệu công khai của trang tham khảo, vốn đối chiếu Oxford 3000, British Council, ELSA Speak, ZIM, Langmaster. Ảnh: Wikipedia PageImages API (ảnh Wikimedia Commons, tải theo nhu cầu và lưu cache); khi không có ảnh, ứng dụng tự vẽ ảnh SVG minh họa (biểu tượng/màu/số) riêng cho từng từ.

## Hạn chế & việc còn lại

- **Ảnh**: ảnh thật lấy từ Wikipedia khi có (chủ yếu với danh từ cụ thể); từ trừu tượng dùng ảnh SVG tự tạo. Nên bổ sung bộ ảnh riêng tự lưu trữ để có ảnh độc nhất cho đủ 3.751 từ, không phụ thuộc mạng.
- **Câu ví dụ**: một phần câu ví dụ trong dữ liệu gốc được sinh theo mẫu nên có câu chưa tự nhiên hoặc sai từ loại (vd. “some fresh grind”). Cần biên tập lại.
- **Phát âm/nhận diện**: dùng Web Speech API của trình duyệt — chất lượng giọng phụ thuộc thiết bị; nhận diện giọng nói chỉ có trên Chrome/Edge/Safari (Firefox không hỗ trợ — ứng dụng chuyển sang chế độ tự chấm). Có thể nâng cấp bằng file audio thu sẵn.
- **Tài khoản & đồng bộ**: tiến độ chỉ lưu trên trình duyệt hiện tại (có xuất/nhập JSON). Chưa có đăng nhập/đồng bộ đám mây.
- **Offline/PWA**: chưa có service worker.
- **Tình huống**: 12 hội thoại cố định; có thể mở rộng thêm hoặc thêm nhánh hội thoại.
