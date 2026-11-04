import {ApiError} from './api.js';

export function officialLookupError(cause:unknown){
  if(cause instanceof ApiError){
    if(cause.status===401)return '로그인 세션이 만료됐습니다. 공식 업무에 다시 로그인하세요.';
    if(cause.status===403)return '이 공식 업무를 확인할 권한이 없습니다. 로그인 계정을 확인하세요.';
    if(cause.status===409)return '업무 상태가 변경됐습니다. 다시 확인한 뒤 진행하세요.';
    if(cause.status===429)return '요청 한도에 도달했습니다. 잠시 뒤 다시 확인하세요.';
  }
  return '공식 업무를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 조회하세요. 이전 목록은 최신 결과가 아닙니다.';
}
