# RPC nội bộ Data Studio — wire format và bẫy (cho người bảo trì script)

Không có API ghi chính thức. Mọi thứ dưới đây đọc từ JS bundle và bắt request UI, đo trên một report thử
ngày 03/10/2026. Google đổi frontend là có thể hỏng; khi lỗi `HTTP 400 code 3` xuất hiện ở
op từng chạy được → bắt lại request UI cùng thao tác và so khác biệt.

## Gọi RPC

- `POST https://datastudio.google.com/<rpc>[?appVersion=<yyyymmdd_hhmm>]`, body JSON.
- Header `X-RAP-XSRF-TOKEN` = `decodeURIComponent(cookie RAP_XSRF_TOKEN)`; cookie phiên đi kèm tự động.
- Response có tiền tố `)]}'` trước JSON. Lỗi: `{"errorStatus":{"code":N}}` (3 = sai định dạng, 13 = lỗi server).
- `appVersion` không bắt buộc.
- Chạy trong tab trung lập `/navigation/reporting`, không mở report → không có editor tự lưu đè.

## Đọc

| RPC | Body | Ghi chú |
| --- | --- | --- |
| getReport | `{reportId, includePages:true, updateViewedDate:false, updateFirestore:false, draftRequestMode:0, mobileFriendlyView:false}` | `reportConfig.{page[], report.resource, navigationInfo, version, shareable}` ~1,3 MB |
| getBlockDatasource | `{datasourceId}` | `{draft, published, projectNumber,…}`; `published.datasourceBlock.fields[]`, `blocks[]` |
| getRevisions | `{entityId:reportId, entityType:1}` | `revisionInfo[0]` mới nhất |

## Ghi

| RPC | Body |
| --- | --- |
| updatePage | `{reportId, pageId, pageRequest:{fieldMask:[4,3], ...page, chartCondition, pageId}, version:<page.version>}` |
| updateReport | `{reportRequest:{componentConfig, chartCondition, conceptDefs, propertyConfig, attributeConfig, resource}, reportId, version:Number(rc.version)}` |
| updateReportNavigationInfo | `{reportId, navigationInfo, version:String(rc.version)}` |
| createPages | `{reportId, pages:[{pageId, page:{…}, displayName, chartCondition:[]}], position:{index:N}}` — `position` số trần → 400; tạo page có sẵn component → 400 |
| deletePages | `{reportId, pageIds:[…]}` |
| publishDatasource | `{draft:<published đã sửa>, clearThumbnails:false, reportId}` |
| getColumns | `{connectorBlockConfig, isBigQueryConnection:false, useThirdpartyAuth:false, projectNumber, googleAuthOAuthToken:''}` |
| createBlockDatasource | `{name, oauthType:1, datasource, reportId, uiCreateOptions:{projectNumber, region:'global'}}` |
| claimDatasourceForReport | `{reportId, datasourceId}` rồi thêm `resource.datasourceAlias {datasourceId, alias:'dsN'}` |
| createNamedRevision | `{reportId, name, aiGenerated:false}` |
| restoreRevision | `{entityId, entityType:1, revisionNumber}` — khôi phục cả field của data source nhúng |

Luôn đọc `version` mới nhất ngay trước khi ghi; ghi xong đọc lại.

## Enum

- Aggregation: NONE 0, AVG 1, COUNT 2, COUNT_DISTINCT 3, MAX 4, MIN 5, SUM 6, AUTO 7, FIRST 8, LAST 9, MEDIAN 10.
- Join (`treeQueryBlockConfig.join.type`): UNKNOWN 0, INNER 1, FULL_OUTER 2, LEFT_OUTER 3, RIGHT_OUTER 4,
  UNION 5, CROSS 101. Gửi 0 → chart blend "System Error". (Bảng mã ghi trong report spike trước đó sai.)
- Filter condition: EQ, PT (contains), BW, RM (regex khớp cả chuỗi), RC (regex contains), IN, GT/GE/LT/LE, BETWEEN, IS_NULL.
- dataType hay gặp: 0 text, 3 number, 8 date.

## Cấu trúc đã chứng minh

- Chart: `{componentId, type, preset:'default', behavior:{mapValue:{entry:[]}}, datasourceId (nguồn thường),
  attributeConfig.componentAttribute{top,left,width,height,…}, propertyConfig.componentProperty{dataset{datasetType 1|2, datasetId},
  dimensions/metrics.labeledConcepts, sort, filters, row?}, conceptDefs[]}`.
  - labeledConcepts: kpi `primary+sparkline` / `primary+target`; line/bar/combo `primary+breakdown`; còn lại `primary`.
  - `row`: line chart và kpi KHÔNG có (line có row → 400); table/bar/pie/combo có.
- conceptDef: `{id:'t0.qt_x', name:'qt_x', namespace:'t0', queryTimeTransformation:{dataTransformation:{sourceFieldName, aggregation?}, displayTransformation?{displayName}}}`.
  Custom metric: `sourceFieldName = tên concept`, `textFormula`, `frontendTextFormula`, `sourceType:1`, `aggregation:7`.
- Dropdown (`dimension-filter`): bắt buộc `datasourceId` gốc + `row:5001` + `dimensionFilterProperty`.
- Date range: `behavior onSelect → lego-change-date-range, isControl:true`.
- Blend: `report.resource.dataViewResource.entry[{key:'dataViewResource…', value:{blockDatasource:{datasourceBlock{fields}, blocks:[{type:6, treeQueryBlockConfig:{join:{left:{query:{concepts, datasourceId}}, right, condition:{and:{conditions:[{boolean:{joinKeyPair}}]}}, type}}}]}}}]`.
  Field đầu ra phải chép `dataType` + `outputSemanticInfo`, concept chép `semantic` từ field gốc.
- Data source Sheets: cột thô (A, B… có `mutableVersion`, không `columnType`) vào connector block (type 2);
  cột `columnType:1` (Record Count + `_123_` = `t0.A`) vào datasourceBlock. Lẫn lộn → "Data Set Configuration Error".

## Bẫy

1. Report đang mở Edit ở bất kỳ tab nào → editor lưu đè thay đổi API. CLI chặn bằng `editorTabsFor`.
2. Sửa blend tại chỗ → chart cũ trả cache cấu hình trước (1 dòng `RESERVED_TOTAL`). CLI đổi componentId.
3. Line/bar/pie vẽ trong iframe khác origin: DOM không có số → `render --screenshot`.
4. Request thêm data source của UI chứa OAuth token (`accessToken`, `googleAuthOAuthToken`). Không bắt/log
   body đó; CLI gửi token rỗng, server dùng credential phiên.
5. `list_pages` của MCP mới đôi khi treo (nhất là lúc tab vừa mở). CLI: khởi động list_pages trước khi mở tab,
   kết nối lại tối đa 2 lần, dọn tab trung lập mồ côi đầu lượt. Vẫn lỗi → đợi ~1 phút chạy lại.
6. Revision tự động rất thưa → `apply --live` luôn tạo named revision trước.
