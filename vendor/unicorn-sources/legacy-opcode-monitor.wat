;; SPDX-License-Identifier: MIT
;; Build from the repository root with WABT 1.0.39:
;; wat2wasm vendor/unicorn-sources/legacy-opcode-monitor.wat -o web/engine/legacy-opcode-monitor.wasm
(module
  (import "unicorn" "memory" (memory 0))
  (import "unicorn" "regRead" (func $reg_read (param i32 i32 i32) (result i32)))
  (global $register (export "register") (mut i32) (i32.const 0))
  (global $scratch (export "scratch") (mut i32) (i32.const 0))
  (global $value (export "value") (mut i32) (i32.const -1))

  ;; Unicorn uc_cb_hookcode_t (engine, address, size, user data).
  ;; Legacy dispatch uses r0 for its table index before the native LDR.
  (func (export "hook") (param $uc i32) (param i64) (param i32) (param i32)
    (if (i32.eqz (call $reg_read (local.get $uc) (global.get $register) (global.get $scratch)))
      (then (global.set $value (i32.load (global.get $scratch))))))
)
