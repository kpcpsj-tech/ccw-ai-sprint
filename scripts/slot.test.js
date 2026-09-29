import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSlot } from "../api/_lib/util.js";

test("시트가 어떤 형태로 보여 주든 같은 시간대로 읽는다", () => {
  assert.equal(normalizeSlot("17:00"), "17:00");
  assert.equal(normalizeSlot("09:00"), "09:00");
  assert.equal(normalizeSlot("9:00"), "09:00");
  assert.equal(normalizeSlot(" 14:00 "), "14:00");
  assert.equal(normalizeSlot("5:00:00 PM"), "17:00");
  assert.equal(normalizeSlot("오후 5:00"), "17:00");
  assert.equal(normalizeSlot("오전 9:00"), "09:00");
  assert.equal(normalizeSlot("12:00 PM"), "12:00");
  assert.equal(normalizeSlot("12:00 AM"), "00:00");
});

test("빈 값과 알 수 없는 값은 그대로 둔다", () => {
  assert.equal(normalizeSlot(""), "");
  assert.equal(normalizeSlot(null), "");
  assert.equal(normalizeSlot("점심"), "점심");
});
