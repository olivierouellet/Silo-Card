// Official Datasheet:
//   HRXL: https://www.maxbotix.com/documents/HRXL-MaxSonar-WR_Datasheet.pdf
//   XL: https://www.maxbotix.com/documents/XL-MaxSonar-WR_Datasheet.pdf
//
// This implementation is designed to work with the TTL Versions of the
// MaxBotix HRXL and XL MaxSonar WR sensor series. The sensor's TTL Pin (5)
// should be wired to one of the ESP's input pins and configured as uart rx_pin.

#include "hrxl_maxsonar_fgl.h"
#include "esphome/core/log.h"

namespace esphome {
namespace hrxl_maxsonar_fgl {

static const char *const TAG = "hrxl.maxsonar.fgl.sensor";

void HrxlMaxsonarFglComponent::loop() {
  // 1 value = 6 characters
  if (this->available() >= 12) {
    // 2 values or more
    this->flush();
  }
  else if (this->available() >= 6) {
    // 1 value only
    this->readDistance();
  }
}

void HrxlMaxsonarFglComponent::readDistance() {
  // Format R#### plus carriage return
  char buffer[5];
  unsigned char tmpchar = 0;
  uint16_t range = 0;
  uint8_t i=0;

  uint32_t start_time = millis();
  uint32_t timeout = 5000;

  bool success_flag = false;
  bool error_flag = false;

  while ( (millis() - start_time) < timeout && tmpchar != 'R') {
    if (this->available() > 0 )
    {
      this->read_byte(&tmpchar);
    }
  }
  if(tmpchar == 'R') {
    while ( (millis() - start_time) < timeout && i <= 4 && !success_flag && !error_flag ) 
    {
      while ((this->available() == 0) && ((millis() - start_time) < timeout))
      {
      }
      this->read_byte(&tmpchar);
      // Test if ASCII number to see if valid number
      if ( i <= 3 && tmpchar >= '0' && tmpchar <= '9' ){
        buffer[i] = tmpchar;
        i += 1;
      }
      // Test if ASCII carriage return '\r' (CR or 13)
      else if (tmpchar == '\r' and i ==4 ){
        // Value ok. End char array with NULL character
        buffer[4] = '\0';
        success_flag = true ;
      }
      else {
        error_flag = true ;
      }
    }
  }

  if (success_flag == true) {
    range = uint16_t( atoi( buffer )) ;
    this->publish_state(range);
  }
  else{
    // error value
    this ->flush();
    this->publish_state(0);
  }
}

void HrxlMaxsonarFglComponent::dump_config() {
  ESP_LOGCONFIG(TAG, "HRXL MaxSonar FGL Sensor:");
  LOG_SENSOR("  ", "Distance", this);
  // As specified in the sensor's data sheet
  this->check_uart_settings(9600, 1, esphome::uart::UART_CONFIG_PARITY_NONE, 8);
}

}  // namespace hrxl_maxsonar_fgl
}  // namespace esphome
