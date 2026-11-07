;; SPDX-License-Identifier: MIT
(module
  (import "unicorn" "stop" (func $stop (param i32) (result i32)))
  (import "unicorn" "observe" (func $observe (param i32 i32)))

  (memory (export "shortcuts") 1)
  (global $budget (export "budget") (mut i32) (i32.const -1))
  (global $clock (export "clock") (mut i64) (i64.const 0))
  (global $start (export "start") (mut i32) (i32.const -1))
  (global $notify (export "notify") (mut i32) (i32.const 0))
  (global $count (export "count") (mut i32) (i32.const 0))
  (global $low (export "low") (mut i32) (i32.const 0))
  (global $high (export "high") (mut i32) (i32.const 0))

  ;; Unicorn uc_cb_hookcode_t (engine, address, size, user data).
  (func (export "hook") (param $uc i32) (param $address i64) (param $size i32) (param i32)
    (local $cost i32)
    (local $pc i32)
    (local $index i32)

    (if (i32.ge_s (global.get $budget) (i32.const 0))
      (then
        (local.set $cost
          (if (result i32) (local.get $size)
            (then (i32.shr_u (i32.add (local.get $size) (i32.const 1)) (i32.const 1)))
            (else (i32.const 1))))
        (if (i32.gt_u (local.get $cost) (global.get $budget))
          (then
            (drop (call $stop (local.get $uc)))
            (return)))
        (global.set $budget (i32.sub (global.get $budget) (local.get $cost)))))

    (global.set $clock
      (i64.add (global.get $clock)
        (i64.extend_i32_u (i32.shr_u (i32.add (local.get $size) (i32.const 3)) (i32.const 2)))))
    (local.set $pc (i32.wrap_i64 (local.get $address)))
    (if (global.get $notify)
      (then
        (call $observe (local.get $pc) (local.get $size))
        (return)))
    (if (i32.or
          (i32.eq (local.get $pc) (global.get $start))
          (i32.or
            (i32.lt_u (local.get $pc) (global.get $low))
            (i32.gt_u (local.get $pc) (global.get $high))))
      (then (return)))
    (block $done
      (loop $search
        (br_if $done (i32.ge_u (local.get $index) (global.get $count)))
        (if (i32.eq (i32.load (i32.shl (local.get $index) (i32.const 2))) (local.get $pc))
          (then
            (call $observe (local.get $pc) (local.get $size))
            (return)))
        (local.set $index (i32.add (local.get $index) (i32.const 1)))
        (br $search))))
)
