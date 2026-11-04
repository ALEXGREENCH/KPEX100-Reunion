// SPDX-License-Identifier: Apache-2.0
// Browser bridge for the separately attributed Yamaha SMAF Player.
#include "ma_player.h"
#include "smaf_file.h"
#include <cstdint>
#include <memory>

using namespace fxchain::smaf;
struct Synth {
  SmafFile file;
  MaPlayer player;
};

extern "C" {
Synth* smaf_create(const uint8_t* data, uint32_t length, uint32_t rate) {
  if (!data || length < 12 || length > 4 * 1024 * 1024 || rate < 8000 || rate > 48000) return nullptr;
  auto synth = std::make_unique<Synth>();
  if (!synth->file.parse(data, length) || !synth->player.init(synth->file, rate)) return nullptr;
  return synth.release();
}
int smaf_render(Synth* synth, float* output, int frames) {
  if (!synth || !output || frames < 1 || frames > 16384) return 0;
  return synth->player.render(output, frames);
}
void smaf_destroy(Synth* synth) { delete synth; }
}
