import * as shared from '@lynkdrive/shared';
import { BOOKING_STATUSES } from 'src/bookings/dto/update-booking-status.dto';
import { FUEL_TYPES, TRANSMISSIONS, VEHICLE_STATUSES } from 'src/vehicles/dto/create-vehicle.dto';

// Las listas que usa class-validator deben coincidir con los contratos compartidos
// que consume la app, para que la validación y los tipos no diverjan.
describe('contratos compartidos (@lynkdrive/shared)', () => {
  it('estados de reserva', () => {
    expect(BOOKING_STATUSES).toEqual([...shared.BOOKING_STATUSES]);
  });

  it('enums de vehículo', () => {
    expect(FUEL_TYPES).toEqual([...shared.FUEL_TYPES]);
    expect(TRANSMISSIONS).toEqual([...shared.TRANSMISSIONS]);
    expect(VEHICLE_STATUSES).toEqual([...shared.VEHICLE_STATUSES]);
  });
});
