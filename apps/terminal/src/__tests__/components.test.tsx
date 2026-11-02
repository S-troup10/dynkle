import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keypad } from '@/components/Keypad';
import { Button, RoundButton, Row } from '@/components/ui';

describe('Keypad', () => {
  it('reports every key press, with spoken labels for the special keys', async () => {
    const onKey = jest.fn();
    await render(<Keypad onKey={onKey} />);
    await fireEvent.press(screen.getByTestId('key-7'));
    await fireEvent.press(screen.getByLabelText('Double zero'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(onKey.mock.calls.map((c) => c[0])).toEqual(['7', '00', 'del']);
  });

  it('has no 00 key in PIN mode', async () => {
    await render(<Keypad onKey={jest.fn()} mode="pin" />);
    expect(screen.queryByTestId('key-00')).toBeNull();
    expect(screen.getByTestId('key-0')).toBeTruthy();
  });

  it('ignores presses while disabled', async () => {
    const onKey = jest.fn();
    await render(<Keypad onKey={onKey} disabled />);
    await fireEvent.press(screen.getByTestId('key-1'));
    expect(onKey).not.toHaveBeenCalled();
    expect(screen.getByTestId('key-1')).toBeDisabled();
  });
});

describe('Button', () => {
  it('is announced as a button with its title', async () => {
    const onPress = jest.fn();
    await render(<Button title="Charge" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Charge' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('is busy and disabled while loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Try again" loading onPress={onPress} testID="b" />);
    const b = screen.getByTestId('b');
    expect(b).toBeDisabled();
    expect(b).toBeBusy();
    await fireEvent.press(b);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Row', () => {
  it('reads label and value as one item', async () => {
    await render(<Row label="Sound" value="On" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Sound, On' })).toBeTruthy();
  });
});

describe('RoundButton', () => {
  it('has a spoken label', async () => {
    await render(<RoundButton name="plus" label="One more Latte" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'One more Latte' })).toBeTruthy();
  });
});
