;; SPDX-License-Identifier: MIT
;; Count common instructions without a JS round trip. Forward every hardware
;; boundary and every opcode that the original hook may handle itself.
(module
  (import "unicorn" "memory" (memory 0))
  (import "unicorn" "slow" (func $slow (param i32 i32)))

  (global $counter (export "counter") (mut i64) (i64.const 0))
  (global $end (export "end") (mut i64) (i64.const -1))
  (global $sdram (export "sdram") (mut i32) (i32.const 0))
  (global $rom (export "rom") (mut i32) (i32.const 0))
  (global $flags (export "flags") (mut i32) (i32.const 0))

  (func (export "hook") (param $uc i32) (param $address i64) (param $size i32) (param i32)
    (local $pc i32)
    (local $instruction i32)
    (local $in_sdram i32)
    (local.set $pc (i32.wrap_i64 (local.get $address)))
    (local.set $in_sdram
      (i32.lt_u (i32.sub (local.get $pc) (i32.const 0x20000000)) (i32.const 0x02000000)))

    (block $slow_path
      ;; Disabled, pending write, budget boundary or next instruction's timer.
      (br_if $slow_path (i32.ne (i32.and (global.get $flags) (i32.const 3)) (i32.const 1)))
      (br_if $slow_path (i64.ge_u (global.get $counter) (global.get $end)))
      (br_if $slow_path (i64.eq (i64.and (global.get $counter) (i64.const 255)) (i64.const 255)))
      (br_if $slow_path (i32.eq (local.get $pc) (i32.const 0x200279b0)))
      (br_if $slow_path (i32.eq (local.get $pc) (i32.const 0x20072c64)))
      (br_if $slow_path
        (i32.and (local.get $in_sdram) (i32.eqz (i32.and (global.get $flags) (i32.const 4)))))

      (if (i32.eq (local.get $size) (i32.const 4))
        (then
          (br_if $slow_path (i32.and (local.get $pc) (i32.const 3)))
          (if (local.get $in_sdram)
            (then
              (local.set $instruction
                (i32.load (i32.add (global.get $sdram)
                  (i32.and (local.get $pc) (i32.const 0xffffff))))))
            (else
              (br_if $slow_path
                (i32.ge_u (i32.sub (local.get $pc) (i32.const 0x70000000)) (i32.const 0x00100000)))
              (local.set $instruction
                (i32.load (i32.add (global.get $rom)
                  (i32.and (local.get $pc) (i32.const 0xfffff)))))))
          (br_if $slow_path
            (i32.eq (i32.and (local.get $instruction) (i32.const 0x0f000010))
              (i32.const 0x0e000010)))))
      (global.set $counter (i64.add (global.get $counter) (i64.const 1)))
      (return))
    (call $slow (local.get $pc) (local.get $size)))
)
