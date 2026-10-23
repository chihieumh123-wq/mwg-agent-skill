# Chuẩn thiết kế dashboard Data Studio

Mọi page dựng mới phải theo guide này, rồi `render` xem ảnh trước khi báo xong. Số liệu vẫn là việc của
`plan-ops-reference.md`; file này chỉ nói **trông thế nào** và **thuộc tính nào ghi được**.

Người xem: người làm SEO và bộ phận kinh doanh của ngành hàng. Mỗi page trả lời đúng 1 câu hỏi
("đang cách mục tiêu bao xa", "việc nào nên làm trước"). Số quan trọng nhất to nhất, còn lại nhỏ dần.

Ký hiệu độ tin cậy: **[đã kiểm]** = khoá có trong JSON do UI Data Studio lưu (backup report), hoặc đã ghi
bằng CLI và đọc lại. **[chưa kiểm]** = suy từ khoá tương tự, phải thử trên 1 thành phần rồi render.

## 1. Nguyên tắc

1. Một page = một câu hỏi. Tiêu đề page nêu kết luận ("Tiến độ: 82% keyword đã vào Top 1-2").
2. Phân cấp bằng kích cỡ và độ đậm, không bằng nhiều màu. Một màu nhấn (xanh), một màu mục tiêu (cam).
3. Thẻ số trước, biểu đồ sau, bảng chi tiết cuối cùng. Đọc từ trên xuống, trái sang phải.
4. Nhấn một thứ, làm xám phần còn lại (ví dụ nhóm "Top 1-2" đậm nhất, các nhóm khác nhạt dần).
5. Màu trạng thái (đạt/gần/xa) chỉ dùng cho trạng thái, luôn kèm chữ. Không dùng làm màu series.
6. Bảng dài phải dễ quét: chữ to, dòng cao, kẻ sọc, hạng và lượng tìm kiếm ở cột dễ thấy.

## 2. Canvas và lưới

Canvas report rộng **2000 px** (`reportAttribute.width`). Xem ảnh hiện trạng: canvas tự co theo bề rộng khung
xem (suy từ ảnh, chưa kiểm cờ `viewModeScale`). Màn laptop 1440 xem ở tỉ lệ ~0,7, nên chữ 14 px thành ~10 px.
Vì vậy thiết kế cho 2000 px và dùng chữ lớn (mục 4). Đừng dồn nội dung vào 1160 px đầu rồi bỏ trống bên phải.

| Thông số | Giá trị |
| --- | --- |
| Lề trái/phải | 40 px (nội dung từ x=40 đến x=1960, rộng 1920) |
| Lưới | 12 cột, mỗi cột 138 px, khoảng cách 24 px |
| Vị trí `left` cột 1…12 | 40, 202, 364, 526, 688, 850, 1012, 1174, 1336, 1498, 1660, 1822 |
| Rộng theo số cột (n) | 162n − 24 → 2 cột 300, 3 cột 462, 4 cột 624, 5 cột 786, 6 cột 948, 7 cột 1110, 8 cột 1272, 12 cột 1920 |
| Khoảng cách dọc giữa các khối | 24 giữa thẻ cùng hàng; 32–40 giữa các khối khác loại |
| Nhãn khối (section) | cao 40, cách khối dưới 4 px |

Khung dọc chuẩn (px, `top`): dải thương hiệu 0–8; tiêu đề 28 (cao 64); mô tả 92 (cao 48); hàng thẻ KPI 156
(cao 150–190); nhãn khối + biểu đồ từ ~372; bảng cuối. Thành phần cùng hàng cùng `top`, cùng `height`.
Tổng chiều cao page ≤ ~1850 để khỏi cuộn quá dài; bảng dài cho phân trang, đừng kéo cao.

Lớp (z-order) = thứ tự thêm trong `componentConfig`: thêm nền trước, rồi dải/thẻ, rồi biểu đồ, rồi chữ/viền nhấn.
Không có op đổi thứ tự; muốn đổi thì xoá page và dựng lại theo thứ tự đúng (xem phần cuối file).

## 3. Màu

Tên token dùng chung với mockup HTML. Mã hex kiểm bằng `validate_palette` (dataviz) và tính tỉ lệ tương phản.

| Token | Hex | Dùng cho | Tương phản trên nền |
| --- | --- | --- | --- |
| `nen-trang` | `#F4F6F8` | Nền page (hình chữ nhật phủ cả page) | – |
| `the` | `#FFFFFF` | Nền thẻ, biểu đồ, bảng | – |
| `vien-the` | `#DDE3EA` | Viền thẻ 1 px | – |
| `luoi` | `#E6EAEF` | Đường lưới biểu đồ, kẻ bảng | – |
| `muc-1` | `#1B2733` | Chữ chính, số KPI | 15,2 : 1 |
| `muc-2` | `#4A5968` | Mô tả, nhãn phụ | 7,2 : 1 |
| `muc-3` | `#5F6C7A` | Chú thích, ghi chú nhỏ | 5,4 : 1 |
| `nhan` | `#2A78D6` | Màu nhấn, series 1 (số thật) | 4,4 : 1 (chỉ cho đồ hoạ, không cho chữ nhỏ) |
| `nhan-dam` | `#184F95` | Nhấn mạnh nhất (nhóm Top 1-2), hero | 8,1 : 1 |
| `muc-tieu` | `#EB6834` | Đường mục tiêu 95%, series 2 | 3,2 : 1 (đồ hoạ) |
| `thuong-hieu` | `#FFD400` | Màu thương hiệu của bạn: dải 8 px trên cùng page, chỉ trang trí | – |
| `dat` | `#17803A` | Trạng thái đạt | 5,0 : 1 |
| `gan-dat` | `#9A5700` | Trạng thái gần đạt | 5,6 : 1 |
| `xa` | `#C5372C` | Trạng thái xa | 5,3 : 1 |

**Series chart (thứ tự cố định, không xoay vòng):** 1 `nhan` `#2A78D6`, 2 `muc-tieu` `#EB6834`. Cặp này qua
kiểm tra: lệch màu cho người mù màu ΔE 24,7, nhìn thường 33,6. Cần hơn 2 series thì dùng bảng/chia nhỏ biểu đồ,
không thêm màu.

**Thang cho nhóm có thứ tự (nhóm hạng):** `#184F95` (1,0–2,0), `#2A78D6` (2,1–3,0), `#5598E7` (3,1–4,0),
`#86B6EF` (4,1–10), ngoài thang (>10) `#8C96A3` xám (3,0 : 1). Bốn bậc xanh qua kiểm tra thang thứ tự
(đơn điệu theo độ sáng, bậc nhạt nhất 2,06 : 1 so với nền).

Màu theo thực thể, không theo thứ hạng: nhóm "Top 1-2" luôn `#184F95` dù số lượng lớn hay nhỏ.

## 4. Chữ (đơn vị px trên canvas 2000)

Font **Roboto** (có sẵn trong theme, hỗ trợ tiếng Việt). Đừng đổi font khi chưa kiểm hiển thị dấu.

| Vai | Cỡ | Độ đậm | Màu |
| --- | --- | --- | --- |
| Tiêu đề page | 36 | đậm | `muc-1` |
| Hero KPI (số) | 72 | thường | `muc-1` |
| KPI thường (số) | 56 | thường | `muc-1` |
| Tên khối (section) | 22 | đậm | `muc-1` |
| Mô tả, chú thích dưới thẻ | 18 | thường | `muc-2` |
| Bảng (thân và tiêu đề cột) | 16 | thường / tiêu đề đậm | `muc-1` |
| Trục, chú giải biểu đồ | 16 | thường | `muc-2` |

Tối thiểu 16 cho mọi chữ đọc để hiểu. Không có chữ dưới 16 trừ dòng chú thích phụ (không dưới 14). Tên thẻ
KPI (nhãn phía trên số) do Data Studio vẽ theo theme, chưa có khoá chỉnh cỡ riêng **[chưa kiểm]**.
Số trong thẻ không viết tắt (không "1,7M"); dùng dấu phân cách đầy đủ.

## 5. Mẫu từng thành phần

**Tiêu đề page + mô tả.** Hai hộp chữ (`add-text` với `html`), trái 40: tiêu đề 36 đậm ở `top` 28, mô tả 18 màu
`muc-2` ở `top` 92, rộng ≤ 1700, tối đa 2 dòng. Mô tả nói mục tiêu, kỳ đo, cách đọc, không nhắc tên field.

**Hàng thẻ KPI.** Hero 4 cột (624 rộng) cho chỉ số trả lời câu hỏi chính, các thẻ
phụ 3 cột (462), ô ngày đo 2 cột (300); cùng `top` 156, cùng cao 190. Số 72/56 px, lề `paddingLeft` 32,
`paddingTop` 20. Dưới hero thêm 1 dòng 18 px nêu mục tiêu bằng số tuyệt đối ("Mục tiêu 95% ≈ 950 / 1.000
keyword"). Mép trái mỗi thẻ có dải nhấn 8 px (hình chữ nhật, hero `nhan`, còn lại `#86B6EF`). Mỗi thẻ 1
số; không đặt 2 số khác đơn vị trong một thẻ.

**Biểu đồ đường tiến độ.** Rộng 8 cột, cao 380. 2 series: số thật `#2A78D6`, mục tiêu `#EB6834`. Trục và chú giải 16.
Chú giải đặt trên cùng, canh trái. Lưới ngang mờ, bỏ lưới dọc nếu có. Chỗ thiếu đợt đo phải để đường liền
(`missingDataDisplayType: 2`), không để điểm rơi về 0. Đường mục tiêu là metric hằng số trong cùng chart
(`95 * COUNT(x) / COUNT(x)`), vì chưa có khoá đường tham chiếu dùng được.

**Biểu đồ tròn nhóm hạng.** Chỉ khi ≤ 5 lát và nhóm có thứ tự. Dạng vòng (`pieHole` 0,55), chú giải bên phải
cỡ 16, xếp lát theo nhóm hạng tăng dần (sort theo dimension, không theo số lượng) để thang màu đi đúng thứ tự.
Nhiều hơn 5 lát hoặc cần so sánh số gần nhau thì dùng bảng hoặc cột ngang.

**Bảng.** Chữ 16, dòng cao 44, ẩn cột số thứ tự, không phân trang cho bảng ≤ 8 dòng, bật phân trang cho bảng dài
(hiển thị tối đa 12 dòng mỗi trang). Chiều cao bảng = 48 (tiêu đề) + 44 × số dòng tối đa + ~56 (tổng, phân trang), ví dụ 12 dòng ≈ 632; bảng ít dòng thì co lại, đừng để khoảng trắng dưới bảng. Bảng dài kẻ sọc `#F6F8FA` / `#FFFFFF`. Cột chữ canh trái, cột số
canh phải (mặc định metric đã canh phải). Link dài để một dòng, không xuống dòng (`bodyTextWrapping: false`).
Một bảng = một việc. Dòng tổng chỉ giữ ở bảng gom nhóm (ngành hàng, loại keyword), bỏ ở bảng chi tiết keyword.

**Ô lọc.** Cao 56, rộng 3 cột (462), đặt hàng riêng ngay dưới mô tả, chữ 18. Metric của ô lọc phải có
`aggregation` (SUM), thiếu thì báo "See details".

**Hộp chữ giải thích.** Nền trắng (`descriptionProperty.backgroundAndBorderProperty.background`), lề 24,
chữ 18, tiêu đề hộp 20 đậm. Dùng một hộp "Cách đọc" khi page có hơn một bảng.

## 6. Trạng thái đạt / gần đạt / xa

Ngưỡng ví dụ (đổi theo mục tiêu của bạn): tỉ lệ keyword Top 1-2: **đạt** ≥ 95%, **gần đạt** 75–94,9%, **xa** < 75%.
Theo hạng từng keyword: Top 1-2 đạt; 2,1–4,0 gần đạt ("sát Top 2"); trên 4,0 xa.

Luôn đi cùng chữ và ký hiệu, không chỉ màu (người mù màu): `● Đạt`, `▲ Gần đạt`, `■ Xa`.

Trên Data Studio hiện chỉ làm được qua trường tính toán trả chữ (ví dụ `CASE WHEN … THEN "Gần đạt" …`) hiển thị
trong bảng; **tô màu chữ/nền theo điều kiện chưa kiểm** (khoá `tableMetricProperty[].colType`, `colTarget`
có trong JSON nhưng chưa rõ giá trị). Chưa làm được thì để chữ trạng thái không màu thay vì giả bằng emoji màu.

## 7. KHÔNG dùng

- Nền trắng cả page với thẻ viền đen mảnh (mặc định theme). Dùng nền `nen-trang` và thẻ trắng.
- Biểu đồ nhiều xanh lá/teal cùng tông (theme mặc định) cho các thứ khác loại.
- Màu `thuong-hieu` vàng hay màu trạng thái làm màu series hoặc màu lát biểu đồ.
- Biểu đồ 2 trục, biểu đồ tròn cho so sánh số sát nhau, lát thứ 6 trở đi.
- Chữ dưới 16, số viết tắt "K/M" trong thẻ KPI, viền 1 px đen quanh mọi thứ.
- Tiêu đề kiểu nhãn ("Tiến độ KPI") không nêu kết luận.
- Page không dùng hết chiều ngang 2000 px (khoảng trống bên phải).
- Bảng 50 dòng không kẻ sọc, không phân trang, cột URL bị cắt.
- Hai hộp lọc cùng page mà mô tả không nói chúng lọc cái gì.

## 8. Khoá style: đã kiểm / chưa kiểm

Đường dẫn tính từ component; dùng trong `update-component.set` (đường chấm). Với mảng (`seriesProperty`) phải
ghi nguyên mảng, không ghi `seriesProperty.0.…` (khoá "0" trên mảng chưa có sẽ tạo object thay vì mảng).

| Thành phần | Khoá | Trạng thái |
| --- | --- | --- |
| mọi component | `attributeConfig.componentAttribute.{top,left,width,height}` | đã kiểm (ghi và đọc lại) |
| Scorecard (`kpi-metric`) | `propertyConfig.componentProperty.kpiMetricProperty.{fontSize, paddingTop, paddingLeft, paddingRight, compactNumbers, hideCompare, metricAlignment}` | khoá đã thấy trong report UI lưu; ghi bằng CLI chưa đọc lại |
| Scorecard | `kpiMetricProperty.{showProgress, progressMin, progressVizType, targetType, showTargetLineLabel}` + `labeledConcepts.target` | chưa kiểm (giá trị enum chưa rõ) |
| Scorecard | `kpiMetricProperty.backgroundAndBorderProperty` | chưa kiểm |
| Bảng | `tableProperty.{fontSize, headerFontSize, dataRowHeight, showRowNum, showPagination, showTotals, showHeader, bodyTextWrapping, openLinksInNewTab, oddRowColor, evenRowColor}` | khoá đã thấy trong report UI lưu |
| Bảng | `tableProperty.columnsWidth[]`, `rowsHeight[]` | đã thấy; để trống khi dựng mới, UI tự điền |
| Bảng | `tableMetricProperty[].colAlignment`, `tableDimensionProperty[].dimAlignment` | đã thấy (1 trái, 2 phải) |
| Bảng | màu tiêu đề cột, nền tiêu đề cột, màu chữ, viền, tô màu theo điều kiện | chưa kiểm (chưa thấy khoá) |
| Biểu đồ đường | `lineChartProperty.seriesProperty[].{seriesColor{color,opacity}, seriesShowPoints, seriesShowDataLabel, seriesLineStyle, seriesAxisIndex}` | đã thấy; `seriesLineStyle` chỉ thấy giá trị 2, không rõ nét đứt |
| Biểu đồ đường | `lineChartProperty.axisAndGridProperty.{axisFontSize, showLeftVGridLine, showAxis, hAxisProperty, leftVAxisProperty}` | đã thấy |
| Biểu đồ đường | `legendProperty.{showLegend, legendPosition, legendAlignment, legendFontSize, legendMaxLines}` | đã thấy (vị trí 2/4, canh 0/1) |
| Biểu đồ đường | `missingDataDisplayType` (2 = nối liền) | đã ghi và đọc lại |
| Biểu đồ đường | `chartDisplayProperty.{chartBackground.color, chartBorder.color}` | đã thấy với giá trị `transparent`; khoá con khác chưa kiểm |
| Biểu đồ đường | `referenceLineProperty[]` | chỉ thấy mẫu rỗng (axis, style, weight, label), chưa thấy khoá giá trị/màu → chưa dùng |
| Biểu đồ tròn | `pieChartProperty.{pieHole, sliceFontSize, sliceFontColor, sliceText, coordinatedColoring, legendProperty{…}}` | đã thấy |
| Biểu đồ tròn | `pieChartProperty.sliceColor[]` | chưa kiểm (chỉ thấy mảng rỗng, chưa rõ phần tử) |
| Hộp chữ | `descriptionProperty.{text(html), fontSize, paddingTop/Left/Right, overflow, backgroundAndBorderProperty.background}` | đã thấy (nền `#FFECB3` trên Overview) |
| Hộp chữ | HTML: `<b>`, `<span style="font-size:…">`, `<br>`, `<div align>` | đã thấy; **màu chữ** `style="color:…"` chưa kiểm (nếu không nhận, chữ vẫn đọc được vì rơi về màu theme) |
| Hộp chữ | `backgroundAndBorderProperty.border` | chưa kiểm trên hộp chữ (có trên ô ngày và hình khối) |
| Hình khối nền (`generic-shape`, preset `shape-rectangle`) | `genericShapeProperty.backgroundAndBorderProperty.{background{color,opacity}, border{color,size,style,radius}}` | đã thấy (nền `#034b54` phủ Overview) |
| Ô chọn ngày / ô lọc | `dateRangePickerProperty.*`, `dimensionFilterProperty.{labelFontSize, paddingTop, lineHeight}` | đã thấy |
| Theme (cả report) | `report.resource.theme` → `themeBorderColor`, `themeBorderWeight`, `themeBorderRadius`, `themeBackground`, `themeFontFamily`, `themeSeriesColor`, `themeGridColor`, `themeTableEvenRowColor`, `themeScorecardPadding`, `themePieHole`, `themeLineWeight`, `themeIncreaseColor`, `themeDecreaseColor`, `themeComponentHeaderColor`, `themeNavigationSelectionFontColor` | đọc và **ghi được** bằng op `set-theme` (đã kiểm) |
| Nền page | khoá riêng cho page | chưa thấy; dùng hình khối phủ page |

## 9. Làm theme để hết viền đen (op `set-theme`, đã áp 23/10/2026)

Viền đen 1 px, bo 4 px của mọi thẻ và biểu đồ là **theme** (`themeBorderColor` `#000000`, `themeBorderWeight` 1,
`themeBorderRadius` 4). Các page cũ không ghi đè nên chịu cùng một kiểu. Muốn dashboard sạch thì đổi theme một lần:

| Khoá theme | Hiện tại | Đề xuất |
| --- | --- | --- |
| `themeBorderColor` | `#000000` | `#DDE3EA` |
| `themeBorderRadius` | 4 | 12 |
| `themeBackground` | `#FFFFFF` | giữ |
| `themeGridColor` | `#d1d1d1` | `#E6EAEF` |
| `themeFontColor` | `#212121` | `#1B2733` |
| `themeComponentHeaderColor` | `#616161` | `#4A5968` |
| `themeSeriesColor[0..1]` | `#36733f`, `#029d98` | `#2A78D6`, `#EB6834` |
| `themeLineWeight` | 2 | 3 |
| `themeScorecardPadding` | `24px` | `32px` |
| `themeTableEvenRowColor` | trong suốt | `#F6F8FA` |
| `themeNavigationSelectionFontColor` | `#36733f` | `#184F95` |

Theme áp cho mọi page của report; page nào không ghi đè style sẽ đổi theo.

## 10. Op còn thiếu trong CLI (mô tả, chưa có code)

1. ~~`set-theme`~~ **đã có** (xem `plan-ops-reference.md`). Plan đã áp: màu series theme = thang nhóm hạng
   `#184F95 #2A78D6 #5598E7 #86B6EF #8C96A3 #B3BBC6`, nên biểu đồ tròn nhóm hạng tự đúng màu khi xếp lát theo nhóm hạng.
   Cũ (mô tả trước khi có op): ghi bằng `updateReport` cùng đường với
   `upsert-filter`, đọc lại so từng khoá. Cần thử trên bản sao report trước vì chưa kiểm.
2. `set-page-style`: đặt nền page nếu có khoá (chưa thấy); thiếu thì giữ hình khối nền.
3. `move-component`: đổi thứ tự lớp (đưa lên đầu/cuối `componentConfig`) để khỏi xoá cả page.
4. `read --components <page>`: in id, loại, vị trí, text từng component để sửa chính xác không cần mở backup 1,3 MB.
5. `add-chart` nhận khối `style` (gộp `set` sau khi tạo) để một op đủ dựng và tô.

Thứ tự dựng page nên giữ: nền → dải/thẻ → biểu đồ → chữ và viền nhấn → ô lọc → `update-component` kiểu → `attach-filter`.

## 11. Danh sách kiểm sau khi render

- [ ] Nội dung phủ hết bề ngang, không khoảng trống > 100 px bên phải.
- [ ] Mọi chữ ≥ 16; số KPI ≥ 56; hero 72.
- [ ] Tiêu đề nêu kết luận; có mô tả 1–2 dòng.
- [ ] Số liệu khớp bảng đối chiếu của task (không đổi khi đổi style).
- [ ] Thẻ cùng hàng cùng `top` và `height`; khoảng cách 24.
- [ ] Biểu đồ đường có đường mục tiêu và không điểm rơi về 0; biểu đồ tròn ≤ 5 lát, đúng thứ tự thang.
- [ ] Bảng có dòng cao 44, kẻ sọc nếu dài, không cột URL bị cắt mất ý nghĩa.
- [ ] Không chart `ERROR`; đã mở ảnh render bằng Read để nhìn chart iframe.

## 12. Biểu đồ "quá trình theo đợt đo" cho nhóm có thứ tự (đã kiểm 23/10/2026)

- **Đừng dùng breakdown theo nhóm hạng.** Thứ tự và màu series đi theo số lượng nên đổi từng đợt, màu không khớp biểu đồ tròn.
- Dùng combo (preset line) với **mỗi nhóm là một metric công thức** `COUNT(CASE WHEN t0.<nhóm hạng> = "1.0-2.0" THEN t0.<keyword> END)`,
  `displayName` = tên nhóm, trục ngày sắp tăng dần (`sortDir: 0`), `breakdownConfig: []`. `seriesProperty[i].seriesColor` đặt
  đúng thang màu, `seriesShowPoints` và `seriesShowDataLabel` bật để thấy số từng đợt. Trục ngày đúng thứ tự (bản breakdown cũ đảo ngày).
- Đợt không có keyword ở nhóm đó hiện 0 (đúng nghĩa), không còn đường đứt.
- **Không đưa 1 series sang trục phải** (`seriesAxisIndex: 1`) để tách line: line lớn bị vẽ chồng lên các line trục trái, nhãn đè nhau
  nặng hơn. Đã thử và trả lại.
- Giới hạn: 6 line cùng nhãn thì 5 nhóm thấp (giá trị gần nhau) vẫn đè nhãn ở đáy, kể cả khi biểu đồ rộng 1100×420.
  **Dạng không đè nhau là cột chồng (stacked column)** — xem mục 13; dùng nó cho nhóm có thứ tự khi cần số từng đợt.

## 13. Cột chồng cho nhóm hạng theo đợt đo (khoá bắt từ giao diện 23/10/2026)

Mỗi đợt đo một cột, mỗi nhóm hạng một khúc màu theo thang nhóm hạng, số ghi trong từng khúc. Không có đường nên không đụng nhau;
độ cao cột = tổng keyword của ngành (cả 6 nhóm), nhìn ra cơ cấu từng đợt. Dựng từ combo theo mục 12 rồi đổi (hoặc dựng thẳng):

| Khoá | Giá trị |
| --- | --- |
| `type` | `simple-barchart` |
| `preset` | `horizontal-stacked` (tên lạ nhưng là **cột đứng** chồng) |
| `propertyConfig.componentProperty.barChartProperty` | `{ "showDataLabel": true, "overrideAxisAuto": true, "seriesProperty": [{ "seriesColor": {"color": "#184F95", "opacity": 1}, "seriesShowDataLabel": true, "seriesAxisIndex": 0 }, ...], "referenceLineProperty": [], "referenceBandProperty": [], "intervalProperty": [] }` |
| `propertyConfig.componentProperty.comboChartProperty` | `null` (xoá) |
| `dimensions.labeledConcepts` | chỉ `primary` (ngày); bỏ `breakdown` |
| `includeTotalOthers` / `row` | `true` / `100` |

Khoá bật nhãn thật là `barChartProperty.showDataLabel` (riêng `seriesShowDataLabel` không đủ). Metric vẫn là 6 công thức `COUNT(CASE WHEN ...)` của mục 12.
Plan mẫu: `plan-ops-reference.md` mục `update-component`. Khúc quá nhỏ (0–3) thì nhãn chồng lên nhau chút ít, chấp nhận được.
