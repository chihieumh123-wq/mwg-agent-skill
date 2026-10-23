# Plan ops — tham chiếu đầy đủ

Plan = file JSON `{"ops": [ ... ]}` (hoặc mảng trần). Chạy tuần tự; live lỗi ở op nào dừng ở op đó.
Mọi op đã ghi thật và đọc lại được trên report thử ngày 03/10/2026, trừ chỗ ghi "chưa kiểm".

## Cách tham chiếu

| Thứ | Nhận | Ghi chú |
| --- | --- | --- |
| `page` | pageId (`p_…`, `85131797`) hoặc tên hiển thị | Tên phải khớp đúng 1 page (không phân biệt hoa thường) |
| `datasource` | alias (`ds4`), datasourceId, key blend, hoặc tên | Report hay có nhiều nguồn trùng tên ("GA4" ×3) → dùng alias lấy từ `read` |
| field | tên kỹ thuật (`_sessions_`) hoặc nhãn (`Sessions`) | Tra bằng lệnh `fields`. Field của blend: nhãn hoặc `<field gốc>_dv0/_dv1` |
| `filter` | key (`filter…`) hoặc tên filter | |

Dimension/metric trong chart nhận 3 dạng:

```json
"Sessions"
{ "field": "Sessions", "agg": "avg", "name": "TB phiên" }
{ "formula": "SUM({Sessions}) / COUNT_DISTINCT({Date})", "name": "Sessions / ngày" }
```

`{Tên field}` trong formula được thay thành `t0.<tên kỹ thuật>`. `agg`: sum, avg, count, count_distinct,
max, min, median, auto, none. Metric trên blend thiếu `agg` thì mặc định SUM (blend không có cách gộp
mặc định, thiếu là "Invalid metric").

`position`: `{ "top", "left", "width", "height" }` theo px canvas (canvas report rộng mặc định ~1200–2000).

## Page

```json
{ "op": "add-page", "name": "Rank", "index": 1 }
{ "op": "rename-page", "page": "Rank", "name": "Rank – Tiến độ" }
{ "op": "move-page", "page": "Rank – Tiến độ", "index": 2 }
{ "op": "delete-page", "page": "Rank – Tiến độ" }
```

`index` tính từ 0. Không xoá được page cuối cùng.

## Chart và control

```json
{ "op": "add-chart", "page": "Overview", "componentId": "cd-rankkpi01",
  "type": "table", "datasource": "ds4",
  "dimensions": ["Session default channel group"], "metrics": ["Sessions", "Active users"],
  "breakdown": null, "sort": { "by": "metric", "dir": "desc" }, "rows": 100, "totals": true,
  "filters": ["filterabc123"], "position": { "top": 150, "left": 20, "width": 520, "height": 380 } }
```

| `type` | Component | Cần |
| --- | --- | --- |
| `table` | simple-table | ≥1 dimension, ≥1 metric |
| `scorecard` | kpi-metric | 1 metric (dimension đầu tiên nếu có = sparkline) |
| `line` / `timeseries` | simple-linechart | dimension ngày; `breakdown` tuỳ chọn |
| `bar` | simple-barchart | `breakdown` tuỳ chọn |
| `combo` | simple-combochart | |
| `pie` | simple-piechart | 1 dimension |

Chưa hỗ trợ: area, geo, scatter, pivot, treemap… (area trả 500 với cấu trúc tối giản). Cần loại khác thì
bắt mẫu UI rồi dùng `add-component`.

```json
{ "op": "add-text", "page": "Overview", "text": "Tiêu đề", "fontSize": 24, "position": { "top": 10, "left": 20, "width": 700, "height": 50 } }
{ "op": "add-text", "page": "Overview", "html": "<b>Đậm</b>", "position": { ... } }
{ "op": "add-date-range", "page": "Overview", "position": { "top": 70, "left": 20 } }
{ "op": "add-dropdown", "page": "Overview", "datasource": "ds4", "field": "Device category", "metric": "Sessions", "position": { "top": 70, "left": 320 } }
{ "op": "add-component", "page": "Overview", "component": { "...": "JSON component thô" } }
{ "op": "update-component", "page": "Overview", "componentId": "cd-rankkpi01",
  "set": { "attributeConfig.componentAttribute.left": 40,
           "propertyConfig.componentProperty.descriptionProperty.text": "Chữ mới" } }
{ "op": "delete-component", "page": "Overview", "componentId": "cd-rankkpi01" }
```

`update-components` = nhiều component cùng page trong **một** lần ghi (dời/đổi cỡ cả bố cục, nhanh hơn nhiều so với từng op):

```json
{ "op": "update-components", "page": "Rank", "items": [
  { "componentId": "cd-abc1234567", "set": { "attributeConfig.componentAttribute.width": 1100 } },
  { "componentId": "cd-def1234567", "set": { "attributeConfig.componentAttribute.top": 696 } } ] }
```

`update-component.set`: đường chấm vào JSON component (xem cấu trúc bằng file backup của `read --task-dir`).
Giá trị `null` = xoá khoá. Dropdown chỉ dùng nguồn thường, chưa kiểm trên blend.

## Theme (cả report)

```json
{ "op": "set-theme", "set": {
  "themeBorderColor": "#DDE3EA", "themeBorderRadius": 12, "themeLineWeight": 3,
  "themeTableEvenRowColor.opacity": 1,
  "themeSeriesColor": ["#184F95", "#2A78D6", "#5598E7", "#86B6EF", "#8C96A3", "#B3BBC6"],
  "themeSeriesColor[1].color": "#EB6834" } }
```

Chỉ đổi giá trị của khoá **đã có** trong `report.resource.theme` (không tạo khoá mới, giữ `seriesRef`/`themeRef`). Khoá màu nhận chuỗi hex
(ghi vào mục `color`); số và chuỗi đặt theo kiểu lá có sẵn; mảng gán lần lượt vào phần tử 0..n-1; `a.b` đi vào map, `[i]`
chọn phần tử danh sách. Theme áp cho **mọi** page của report: màu series theme quyết định màu lát biểu đồ tròn và các
series chưa có `seriesColor` riêng. Đã ghi thật và đọc lại đúng (20/23/10/2026, checkpoint revision 45).

## Filter

```json
{ "op": "upsert-filter", "key": "filterorganic01", "name": "Chỉ Organic",
  "datasource": "ds4", "field": "Session default channel group",
  "condition": "EQ", "values": ["Organic Search"], "include": true }
{ "op": "attach-filter", "filter": "Chỉ Organic", "page": "Overview", "componentId": "cd-rankkpi01" }
{ "op": "attach-filter", "filter": "Chỉ Organic", "page": "Overview" }
{ "op": "delete-filter", "filter": "Chỉ Organic", "force": true }
```

`condition`: EQ, IN, contains (PT), starts_with (BW), regex (RM, khớp cả chuỗi), regex_contains (RC),
GT/GE/LT/LE/BETWEEN (số), IS_NULL. `include:false` = loại trừ. `attach-filter` không có `componentId`
= filter cả page. Filter chỉ tác động chart cùng data source. `delete-filter` đang được dùng thì báo lỗi;
`force:true` gỡ tham chiếu khỏi mọi page/chart rồi mới xoá.

## Blend

```json
{ "op": "upsert-blend", "name": "GA4 x GSC theo ngày", "key": "dataViewResourcega4gsc01",
  "joinType": "left",
  "left":  { "datasource": "ds4", "dimensions": ["Date"], "metrics": ["Sessions"] },
  "right": { "datasource": "ds2", "dimensions": ["Date"], "metrics": ["Url Clicks"] },
  "joinKeys": [["Date", "Date"]] }
{ "op": "delete-blend", "blend": "GA4 x GSC theo ngày" }
```

`joinType`: left, right, inner, full, cross. Hai bảng (trái/phải); field key tự thêm vào dimension.
Nhãn trùng ở bảng phải tự thêm hậu tố " (phải)". Chart trên blend: `"datasource": "<tên hoặc key blend>"`.
Đã kiểm: join theo cột chữ (Kênh) và theo ngày (GA4 × GSC).
Upsert blend đã có: chart đang dùng blend được đổi componentId để bỏ cache (output `rotated`).

## Data source

```json
{ "op": "add-calculated-field", "datasource": "ds1", "name": "Đếm NH x2", "formula": "COUNT({Ngành hàng}) * 2", "kind": "metric" }
{ "op": "delete-field", "datasource": "ds1", "field": "Đếm NH x2" }
{ "op": "add-sheets-datasource", "spreadsheetId": "<ID>", "sheetId": "0", "name": "Tên nguồn mới" }
{ "op": "refresh-fields", "datasource": "ds0" }
```

- `kind` bỏ trống: formula có hàm gộp (SUM/COUNT/AVG…) → metric, không thì dimension.
- `delete-field` chỉ xoá field do người tạo (createdBy 2).
- `add-sheets-datasource`: tài khoản profile phải đọc được sheet; `sheetId` = số gid trên URL. Bước sau
  tham chiếu nguồn mới theo đúng `name`. Nguồn GA4/GSC/BigQuery mới: chưa kiểm.
- `refresh-fields` (chỉ Sheets): đọc lại cột khi sheet đổi cột (lỗi SHEETS_COLUMN_ORDER_CHANGED).
  Giữ calculated field người tạo. Cột bị đổi tên/xoá → chart dùng cột đó chuyển "Invalid dimension":
  phải sửa chart (field cũ đã không còn trong sheet, không phải lỗi của lệnh).

## Ví dụ plan dựng 1 page dashboard

```json
{ "ops": [
  { "op": "add-page", "name": "Organic Overview" },
  { "op": "add-text", "page": "Organic Overview", "text": "Organic – TGDĐ", "fontSize": 24, "position": { "top": 10, "left": 20, "width": 600, "height": 50 } },
  { "op": "add-date-range", "page": "Organic Overview", "position": { "top": 70, "left": 20 } },
  { "op": "upsert-filter", "key": "filterorgonly01", "name": "Chỉ Organic Search", "datasource": "ds4", "field": "Session default channel group", "values": ["Organic Search"] },
  { "op": "attach-filter", "filter": "Chỉ Organic Search", "page": "Organic Overview" },
  { "op": "add-chart", "page": "Organic Overview", "type": "scorecard", "datasource": "ds4", "metrics": ["Sessions"], "position": { "top": 150, "left": 20, "width": 260, "height": 120 } },
  { "op": "add-chart", "page": "Organic Overview", "type": "line", "datasource": "ds4", "dimensions": ["Date"], "metrics": ["Sessions"], "sort": { "by": "dimension", "dir": "asc" }, "position": { "top": 150, "left": 300, "width": 700, "height": 260 } }
] }
```
