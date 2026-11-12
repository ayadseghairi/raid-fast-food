/**
 * Icon wrapper – maps semantic names to Boxicons (react-icons/bi).
 * Features import from here; never import react-icons directly in components.
 *
 * Usage:  <Icon name="edit" size={20} />
 * @module src/components/Icon
 */
import React from 'react';
import {
  BiCart,
  BiPrinter,
  BiTrash,
  BiEditAlt,
  BiPlus,
  BiMinus,
  BiX,
  BiHome,
  BiBarChartAlt2,
  BiUser,
  BiPackage,
  BiStore,
  BiReceipt,
  BiMoney,
  BiCog,
  BiCalendarCheck,
  BiLogOut,
  BiSearch,
  BiCamera,
  BiImageAlt,
  BiPause,
  BiPlay,
  BiCheck,
  BiArrowBack,
  BiChevronDown,
  BiChevronUp,
  BiChevronLeft,
  BiChevronRight,
  BiRefresh,
  BiDownload,
  BiUpload,
  BiPhone,
  BiMapPin,
  BiTime,
  BiNote,
  BiStar,
  BiInfoCircle,
  BiErrorCircle,
  BiCheckCircle,
  BiLock,
  BiKey,
  BiSliderAlt,
  BiListUl,
  BiFilter,
  BiSolidTruck,
  BiRestaurant,
  BiUndo,
  BiFolderOpen,
  BiReset,
  BiGroup,
} from 'react-icons/bi';

const ICON_MAP = {
  cart: BiCart,
  print: BiPrinter,
  trash: BiTrash,
  edit: BiEditAlt,
  plus: BiPlus,
  minus: BiMinus,
  close: BiX,
  home: BiHome,
  report: BiBarChartAlt2,
  user: BiUser,
  package: BiPackage,
  store: BiStore,
  receipt: BiReceipt,
  money: BiMoney,
  settings: BiCog,
  calendar: BiCalendarCheck,
  logout: BiLogOut,
  search: BiSearch,
  camera: BiCamera,
  image: BiImageAlt,
  pause: BiPause,
  play: BiPlay,
  check: BiCheck,
  back: BiArrowBack,
  chevronDown: BiChevronDown,
  chevronUp: BiChevronUp,
  chevronLeft: BiChevronLeft,
  chevronRight: BiChevronRight,
  refresh: BiRefresh,
  download: BiDownload,
  upload: BiUpload,
  phone: BiPhone,
  location: BiMapPin,
  time: BiTime,
  note: BiNote,
  star: BiStar,
  info: BiInfoCircle,
  error: BiErrorCircle,
  success: BiCheckCircle,
  lock: BiLock,
  key: BiKey,
  options: BiSliderAlt,
  list: BiListUl,
  filter: BiFilter,
  delivery: BiSolidTruck,
  kitchen: BiRestaurant,
  undo: BiUndo,
  folder: BiFolderOpen,
  restore: BiReset,
  // Navigation aliases
  pos:        BiReceipt,
  orders:     BiListUl,
  products:   BiPackage,
  suppliers:  BiStore,
  expenses:   BiMoney,
  workersPay: BiGroup,
  reports:    BiBarChartAlt2,
  closeDay:   BiCalendarCheck,
};

/**
 * @param {{ name: string, size?: number, className?: string, style?: object }} props
 */
export default function Icon({ name, size = 20, className = '', style }) {
  const IconComponent = ICON_MAP[name];
  if (!IconComponent) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Icon] unknown icon name: "${name}"`);
    }
    return null;
  }
  return <IconComponent size={size} className={className} style={style} />;
}
