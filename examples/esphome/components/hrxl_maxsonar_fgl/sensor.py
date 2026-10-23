import esphome.codegen as cg
from esphome.components import sensor, uart
from esphome.const import (
    STATE_CLASS_MEASUREMENT,
    UNIT_METER,
    ICON_ARROW_EXPAND_VERTICAL,
)

CODEOWNERS = ["@fgl"]
DEPENDENCIES = ["uart"]

hrxlmaxsonarfgl_ns = cg.esphome_ns.namespace("hrxl_maxsonar_fgl")
HrxlMaxsonarFglComponent = hrxlmaxsonarfgl_ns.class_(
    "HrxlMaxsonarFglComponent", sensor.Sensor, cg.Component, uart.UARTDevice
)

CONFIG_SCHEMA = sensor.sensor_schema(
    HrxlMaxsonarFglComponent,
    unit_of_measurement=UNIT_METER,
    icon=ICON_ARROW_EXPAND_VERTICAL,
    accuracy_decimals=3,
    state_class=STATE_CLASS_MEASUREMENT,
).extend(uart.UART_DEVICE_SCHEMA)


async def to_code(config):
    var = await sensor.new_sensor(config)
    await cg.register_component(var, config)
    await uart.register_uart_device(var, config)
