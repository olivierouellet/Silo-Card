#pragma once

#include "esphome/core/component.h"
#include "esphome/components/sensor/sensor.h"
#include "esphome/components/uart/uart.h"

namespace esphome {
namespace hrxl_maxsonar_fgl {

class HrxlMaxsonarFglComponent : public sensor::Sensor, public Component, public uart::UARTDevice {
 public:
  // Nothing really public.
  // ========== INTERNAL METHODS ==========
  void loop() override;
  void dump_config() override;

 protected:
  void readDistance();
};

}  // namespace hrxl_maxsonar_fgl
}  // namespace esphome
