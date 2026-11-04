# Exact idle-loop acceleration

The Kingston 2.12 RTOS idle loop is 18 ARM instructions long. Its only memory
effect is incrementing an idle counter. Reunion can reproduce those operations
arithmetically, including partial iterations, without returning to Python for
every ARM instruction. The ROM SHA256 and loop address gate this optimization.

The emulator still advances every hardware timer at the original 256-instruction
sampling boundaries. It preserves CPSR flags, the changing IRQ mask, all register
effects, counter overflow, and the requested execution budget. A deliverable IRQ
or FIQ immediately returns execution to Unicorn at the exception vector. User
mode and unaligned/out-of-range counter pointers use ordinary execution.

Differential tests compare optimized and unoptimized execution across short and
long budgets, timer boundaries, IRQ/FIQ delivery, flags and counter wrap. Live
menu and native Hell Fire checkpoints also produce matching registers, interrupt
counts and framebuffer hashes. See `evidence/idle-integrated.json`.

One local benchmark compared this implementation with the preceding optimization
that returned to Unicorn before every timer boundary:

| Scenario                             | Previous | Current |  Speedup |
| ------------------------------------ | -------: | ------: | -------: |
| Idle, 2 million virtual instructions |  0.291 s | 0.071 s | 4.1Р“вЂ” |
| Menu key held, 10 million            |  2.666 s | 2.020 s | 1.3Р“вЂ” |
| Menu release/transition, 30 million  |  8.586 s | 7.193 s | 1.2Р“вЂ” |

These are host timings from one run, not device speed guarantees. Frame drawing
continues to execute the original firmware instructions and limits menu speed.
The optimization preserves the emulator's existing timer model; it does not
make ARM instruction timing cycle accurate. Diagnostic instruction traces are
compressed while replaying idle iterations. Use `fast_idle=False` for a complete
instruction trace or differential investigation.
